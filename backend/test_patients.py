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
from app import models  # noqa: F401  (registers tables)

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


SAMPLE = {"first_name": "Ana", "last_name": "Lopez", "date_of_birth": "1990-04-12", "phone": "520-555-0100"}


class TestPatients(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user] = lambda: object()
        self.client = TestClient(app)

    def tearDown(self):
        Base.metadata.drop_all(engine)
        app.dependency_overrides.clear()

    def test_create_patient(self):
        r = self.client.post("/patients", json=SAMPLE)
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["last_name"], "Lopez")
        self.assertIn("id", r.json())

    def test_create_patient_missing_field(self):
        r = self.client.post("/patients", json={"first_name": "Ana"})
        self.assertEqual(r.status_code, 422)

    def test_list_and_get_patient(self):
        pid = self.client.post("/patients", json=SAMPLE).json()["id"]
        self.assertEqual(len(self.client.get("/patients").json()), 1)
        r = self.client.get(f"/patients/{pid}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["first_name"], "Ana")

    def test_get_missing_patient(self):
        self.assertEqual(self.client.get("/patients/999").status_code, 404)

    def test_update_patient(self):
        pid = self.client.post("/patients", json=SAMPLE).json()["id"]
        r = self.client.put(f"/patients/{pid}", json={**SAMPLE, "phone": "520-555-0199"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["phone"], "520-555-0199")

    def test_update_missing_patient(self):
        self.assertEqual(self.client.put("/patients/999", json=SAMPLE).status_code, 404)

    def test_requires_login(self):
        app.dependency_overrides.pop(get_current_user)
        self.assertEqual(self.client.get("/patients").status_code, 401)

    def test_manager_can_delete_patient(self):
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role="lab_manager")
        pid = self.client.post("/patients", json=SAMPLE).json()["id"]
        response = self.client.delete(f"/patients/{pid}")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.content, b"")
        self.assertEqual(self.client.get(f"/patients/{pid}").status_code, 404)
        self.assertEqual(self.client.get("/patients").json(), [])

    def test_other_roles_cannot_delete_patient(self):
        pid = self.client.post("/patients", json=SAMPLE).json()["id"]
        for role in ("specimen_collector", "lab_technician", "pathologist", "billing", "physician", "", "admin"):
            with self.subTest(role=role):
                app.dependency_overrides[get_current_user] = lambda role=role: SimpleNamespace(role=role)
                self.assertEqual(self.client.delete(f"/patients/{pid}").status_code, 403)
                self.assertEqual(self.client.get(f"/patients/{pid}").status_code, 200)

    def test_delete_missing_patient(self):
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role="lab_manager")
        self.assertEqual(self.client.delete("/patients/999").status_code, 404)

    def test_delete_requires_login(self):
        pid = self.client.post("/patients", json=SAMPLE).json()["id"]
        app.dependency_overrides.pop(get_current_user)
        self.assertEqual(self.client.delete(f"/patients/{pid}").status_code, 401)
        app.dependency_overrides[get_current_user] = lambda: object()
        self.assertEqual(self.client.get(f"/patients/{pid}").status_code, 200)


if __name__ == "__main__":
    unittest.main()
