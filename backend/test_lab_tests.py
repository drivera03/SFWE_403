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

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


SAMPLE_PATIENT = {"first_name": "Ana", "last_name": "Lopez", "date_of_birth": "1990-04-12", "phone": "520-555-0100"}
SAMPLE_TEST = {"test_name": "Comprehensive Metabolic Panel (CMP)", "status": "pending"}


class TestLabTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, role="lab_manager")
        self.client = TestClient(app)

    def tearDown(self):
        Base.metadata.drop_all(engine)
        app.dependency_overrides.clear()

    def test_create_and_list_tests_for_patient(self):
        p_res = self.client.post("/patients", json=SAMPLE_PATIENT)
        pid = p_res.json()["id"]

        # Create test
        t_res = self.client.post(f"/patients/{pid}/tests", json=SAMPLE_TEST)
        self.assertEqual(t_res.status_code, 201)
        test_data = t_res.json()
        self.assertEqual(test_data["test_name"], SAMPLE_TEST["test_name"])
        self.assertEqual(test_data["status"], "pending")
        self.assertEqual(test_data["patient_id"], pid)

        # List tests
        list_res = self.client.get(f"/patients/{pid}/tests")
        self.assertEqual(list_res.status_code, 200)
        self.assertEqual(len(list_res.json()), 1)
        self.assertEqual(list_res.json()[0]["id"], test_data["id"])

    def test_get_single_test(self):
        pid = self.client.post("/patients", json=SAMPLE_PATIENT).json()["id"]
        tid = self.client.post(f"/patients/{pid}/tests", json=SAMPLE_TEST).json()["id"]

        r = self.client.get(f"/patients/{pid}/tests/{tid}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["id"], tid)
        self.assertEqual(r.json()["test_name"], SAMPLE_TEST["test_name"])

    def test_update_test(self):
        pid = self.client.post("/patients", json=SAMPLE_PATIENT).json()["id"]
        tid = self.client.post(f"/patients/{pid}/tests", json=SAMPLE_TEST).json()["id"]

        r = self.client.put(f"/patients/{pid}/tests/{tid}", json={"status": "completed"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "completed")

    def test_delete_test(self):
        pid = self.client.post("/patients", json=SAMPLE_PATIENT).json()["id"]
        tid = self.client.post(f"/patients/{pid}/tests", json=SAMPLE_TEST).json()["id"]

        # Patient cannot be deleted while test exists
        del_p = self.client.delete(f"/patients/{pid}")
        self.assertEqual(del_p.status_code, 400)

        # Delete test
        del_t = self.client.delete(f"/patients/{pid}/tests/{tid}")
        self.assertEqual(del_t.status_code, 204)

        # Verify test is gone
        self.assertEqual(self.client.get(f"/patients/{pid}/tests/{tid}").status_code, 404)

        # Now patient can be deleted
        del_p2 = self.client.delete(f"/patients/{pid}")
        self.assertEqual(del_p2.status_code, 204)

    def test_patient_not_found(self):
        self.assertEqual(self.client.get("/patients/999/tests").status_code, 404)
        self.assertEqual(self.client.post("/patients/999/tests", json=SAMPLE_TEST).status_code, 404)
        self.assertEqual(self.client.get("/patients/999/tests/1").status_code, 404)


if __name__ == "__main__":
    unittest.main()
