import os
os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-testing-32charsmin")

import unittest
from types import SimpleNamespace
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.dependencies import get_current_user
from app.main import app
from app import models  # noqa: F401
from app.models.patient import Patient
from app.models.tests import Physician
from app.models.activity_log import ActivityLog

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


class TestTestIntake(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, role="technician")
        self.client = TestClient(app)

        db = TestingSession()
        patient = Patient(first_name="Ana", last_name="Lopez", date_of_birth=None)
        physician = Physician(name="Dr. Gregory House")
        db.add_all([patient, physician])
        db.commit()
        self.patient_id = patient.id
        self.physician_id = physician.id
        db.close()

    def tearDown(self):
        Base.metadata.drop_all(engine)
        app.dependency_overrides.clear()

    def make_test(self, **overrides):
        body = {
            "report_id": "RPT-001",
            "patient_id": self.patient_id,
            "physician_id": self.physician_id,
            "sample_type": "blood",
            "sample_id": "SMP-001",
            "collection_datetime": "2026-10-27T09:30:00",
            "test_name": "Lipid Panel",
            "units": "mg/dL",
            "reference_range_low": 0,
            "reference_range_high": 200,
        }
        body.update(overrides)
        return body

    # POST /tests
    def test_create_test(self):
        r = self.client.post("/tests", json=self.make_test())
        self.assertEqual(r.status_code, 201)
        data = r.json()
        self.assertEqual(data["test_name"], "Lipid Panel")
        self.assertEqual(data["patient_id"], self.patient_id)
        self.assertEqual(data["status"], "pending")
        self.assertEqual(data["collected_by_id"], 1)

    def test_create_test_ignores_status_in_body(self):
        r = self.client.post("/tests", json=self.make_test(status="validated"))
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["status"], "pending")

    def test_create_test_missing_patient(self):
        r = self.client.post("/tests", json=self.make_test(patient_id=999))
        self.assertEqual(r.status_code, 404)

    def test_create_test_missing_physician(self):
        r = self.client.post("/tests", json=self.make_test(physician_id=999))
        self.assertEqual(r.status_code, 404)

    def test_create_test_bad_sample_type(self):
        r = self.client.post("/tests", json=self.make_test(sample_type="saliva"))
        self.assertEqual(r.status_code, 422)

    def test_create_test_missing_required_field(self):
        body = self.make_test()
        del body["test_name"]
        r = self.client.post("/tests", json=body)
        self.assertEqual(r.status_code, 422)

    def test_create_test_duplicate_report_id(self):
        self.client.post("/tests", json=self.make_test())
        r = self.client.post("/tests", json=self.make_test(sample_id="SMP-002"))
        self.assertEqual(r.status_code, 409)

    def test_create_test_duplicate_sample_id(self):
        self.client.post("/tests", json=self.make_test())
        r = self.client.post("/tests", json=self.make_test(report_id="RPT-002"))
        self.assertEqual(r.status_code, 409)

    # GET /tests/{id}
    def test_get_test(self):
        tid = self.client.post("/tests", json=self.make_test()).json()["id"]
        r = self.client.get(f"/tests/{tid}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["id"], tid)
        self.assertEqual(r.json()["sample_id"], "SMP-001")

    def test_get_test_not_found(self):
        r = self.client.get("/tests/999")
        self.assertEqual(r.status_code, 404)

    # GET /tests?patient_id=
    def test_list_tests_for_patient(self):
        self.client.post("/tests", json=self.make_test())
        self.client.post("/tests", json=self.make_test(
            report_id="RPT-002", sample_id="SMP-002", collection_datetime="2026-10-28T09:30:00"))
        r = self.client.get(f"/tests?patient_id={self.patient_id}")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["report_id"], "RPT-002")  # newest first

    def test_list_tests_only_returns_that_patients_tests(self):
        db = TestingSession()
        other = Patient(first_name="Ben", last_name="Kim", date_of_birth=None)
        db.add(other)
        db.commit()
        other_id = other.id
        db.close()

        self.client.post("/tests", json=self.make_test())
        r = self.client.get(f"/tests?patient_id={other_id}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), [])

    def test_list_tests_patient_not_found(self):
        r = self.client.get("/tests?patient_id=999")
        self.assertEqual(r.status_code, 404)

    def test_list_tests_requires_patient_id(self):
        r = self.client.get("/tests")
        self.assertEqual(r.status_code, 422)

    # Intake tests must show up on the patient (single source of truth)
    def test_created_test_appears_on_patient_record(self):
        tid = self.client.post("/tests", json=self.make_test()).json()["id"]
        r = self.client.get(f"/patients/{self.patient_id}")
        self.assertEqual(r.status_code, 200)
        tests = r.json()["tests"]
        self.assertEqual([t["id"] for t in tests], [tid])
        self.assertEqual(tests[0]["test_name"], "Lipid Panel")
        self.assertEqual(tests[0]["status"], "pending")

    def as_manager(self):
        # Deleting a patient is a lab_manager-only action.
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, role="lab_manager")

    def test_patient_delete_blocked_by_intake_test(self):
        self.client.post("/tests", json=self.make_test())
        self.as_manager()
        r = self.client.delete(f"/patients/{self.patient_id}")
        self.assertEqual(r.status_code, 400)

    def test_get_test_includes_physician_name(self):
        tid = self.client.post("/tests", json=self.make_test()).json()["id"]
        r = self.client.get(f"/tests/{tid}")
        self.assertEqual(r.json()["physician"]["name"], "Dr. Gregory House")

    # PUT /tests/{id}
    def test_update_test_name_and_notes(self):
        tid = self.client.post("/tests", json=self.make_test()).json()["id"]
        r = self.client.put(f"/tests/{tid}", json={"test_name": "Lipid Panel (fasting)", "notes": "fasted 12h"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["test_name"], "Lipid Panel (fasting)")
        self.assertEqual(r.json()["notes"], "fasted 12h")

    def test_update_status_requires_result(self):
        tid = self.client.post("/tests", json=self.make_test()).json()["id"]
        r = self.client.put(f"/tests/{tid}", json={"status": "completed"})
        self.assertEqual(r.status_code, 422)
        self.assertIn("'completed'", r.json()["detail"])
        # nothing was changed
        self.assertEqual(self.client.get(f"/tests/{tid}").json()["status"], "pending")

    def test_complete_test_with_result(self):
        tid = self.client.post("/tests", json=self.make_test()).json()["id"]
        r = self.client.put(f"/tests/{tid}", json={"status": "completed", "result_numeric": 185.5})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["status"], "completed")
        self.assertEqual(data["result_numeric"], 185.5)
        self.assertIsNotNone(data["results_received_datetime"])
        self.assertEqual(data["performed_by_id"], 1)

    def test_update_rejects_unknown_status(self):
        tid = self.client.post("/tests", json=self.make_test()).json()["id"]
        r = self.client.put(f"/tests/{tid}", json={"status": "in_progress"})
        self.assertEqual(r.status_code, 422)

    def test_update_test_not_found(self):
        self.assertEqual(self.client.put("/tests/999", json={"notes": "x"}).status_code, 404)

    # DELETE /tests/{id}
    def test_delete_test_then_patient_can_be_deleted(self):
        tid = self.client.post("/tests", json=self.make_test()).json()["id"]
        self.assertEqual(self.client.delete(f"/tests/{tid}").status_code, 204)
        self.assertEqual(self.client.get(f"/tests/{tid}").status_code, 404)
        self.assertEqual(self.client.get(f"/patients/{self.patient_id}").json()["tests"], [])
        self.as_manager()
        self.assertEqual(self.client.delete(f"/patients/{self.patient_id}").status_code, 204)

    def test_delete_test_not_found(self):
        self.assertEqual(self.client.delete("/tests/999").status_code, 404)

    # Activity log
    def test_create_update_delete_are_logged(self):
        tid = self.client.post("/tests", json=self.make_test()).json()["id"]
        self.client.put(f"/tests/{tid}", json={"notes": "x"})
        self.client.delete(f"/tests/{tid}")
        db = TestingSession()
        actions = [a.action for a in db.query(ActivityLog).order_by(ActivityLog.id).all()]
        db.close()
        self.assertEqual(actions, ["test_created", "test_updated", "test_deleted"])

    def test_external_users_cannot_access_tests(self):
        # ConOps 6.3.1/6.3.2/6.3.5: test entry and tracking are for laboratory personnel.
        for role in ("patient", "physician"):
            with self.subTest(role=role):
                app.dependency_overrides[get_current_user] = lambda role=role: SimpleNamespace(id=1, role=role)
                self.assertEqual(self.client.post("/tests", json=self.make_test()).status_code, 403)
                self.assertEqual(self.client.get("/tests", params={"patient_id": self.patient_id}).status_code, 403)

    def test_requires_login(self):
        app.dependency_overrides.pop(get_current_user)
        self.assertEqual(self.client.get("/tests/1").status_code, 401)
        self.assertEqual(self.client.post("/tests", json=self.make_test()).status_code, 401)


if __name__ == "__main__":
    unittest.main()