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

    def test_requires_login(self):
        app.dependency_overrides.pop(get_current_user)
        self.assertEqual(self.client.get("/tests/1").status_code, 401)
        self.assertEqual(self.client.post("/tests", json=self.make_test()).status_code, 401)


if __name__ == "__main__":
    unittest.main()