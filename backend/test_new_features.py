import os
import unittest
from datetime import datetime, timezone

TEST_DB_FILE = "/tmp/test_new_features.db" if os.path.exists("/tmp") else "test_new_features.db"
os.environ["SECRET_KEY"] = "test-secret-key-for-unit-testing-32charsmin"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_FILE}"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.models.user import User
from app.models.patient import Patient
from app.models.lab_test import LabTest
from app.models.activity_log import ActivityLog
from app.security import create_access_token, password_hash, verify_password
from app.routers import auth, patients

test_engine = create_engine(
    f"sqlite:///{TEST_DB_FILE}",
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


class TestNewFeatures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=test_engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=test_engine)
        if os.path.exists(TEST_DB_FILE):
            try:
                os.remove(TEST_DB_FILE)
            except OSError:
                pass

    def setUp(self):
        Base.metadata.drop_all(bind=test_engine)
        Base.metadata.create_all(bind=test_engine)
        self.db = TestingSessionLocal()

        # Seed users
        self.manager = User(
            id=1,
            username="manager_jane",
            email="manager@clms.local",
            password_hash=password_hash.hash("ManagerPass123!"),
            role="lab_manager",
            is_locked=False,
            failed_attempts=0,
            failed_login_attempts=0,
        )
        self.collector = User(
            id=2,
            username="collector_bob",
            email="collector@clms.local",
            password_hash=password_hash.hash("CollectorPass123!"),
            role="specimen_collector",
            is_locked=False,
            failed_attempts=0,
            failed_login_attempts=0,
        )
        self.tech = User(
            id=3,
            username="tech_alice",
            email="tech@clms.local",
            password_hash=password_hash.hash("TechPass123!"),
            role="technician",
            is_locked=False,
            failed_attempts=0,
            failed_login_attempts=0,
        )
        self.locked_user = User(
            id=4,
            username="locked_dan",
            email="locked@clms.local",
            password_hash=password_hash.hash("LockedPass123!"),
            role="technician",
            is_locked=True,
            failed_attempts=5,
            failed_login_attempts=5,
        )
        self.db.add_all([self.manager, self.collector, self.tech, self.locked_user])

        # Seed sample patients
        self.patient_with_tests = Patient(
            id=101,
            name="Alice Smith",
            dob="1988-06-15",
            address="123 Health Ave, Tucson, AZ",
            phone="520-555-0101",
            email="alice.smith@example.com",
            insurance_provider="Blue Cross Blue Shield",
            policy_number="BCBS-987654",
        )
        self.patient_without_tests = Patient(
            id=102,
            name="Charlie Brown",
            dob="1975-11-20",
            address="456 Elm St, Tucson, AZ",
            phone="520-555-0102",
            email="charlie.brown@example.com",
            insurance_provider="Aetna",
            policy_number="AET-123456",
        )
        self.db.add_all([self.patient_with_tests, self.patient_without_tests])
        self.db.commit()

        # Seed linked test for patient 101
        self.test_order = LabTest(
            id=201,
            patient_id=101,
            test_name="Comprehensive Metabolic Panel",
            status="pending",
        )
        self.db.add(self.test_order)
        self.db.commit()

        # App & Client setup
        self.app = FastAPI()
        self.app.include_router(auth.router)
        self.app.include_router(patients.router)

        def override_get_db():
            db = TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(self.app)

        self.manager_token = create_access_token(sub="1", role="lab_manager")
        self.collector_token = create_access_token(sub="2", role="specimen_collector")
        self.tech_token = create_access_token(sub="3", role="technician")

    def tearDown(self):
        self.db.close()
        self.app.dependency_overrides.clear()

    # ============================================================
    # Ticket SXFT5-32: POST /auth/register endpoint (Lab Manager only)
    # ============================================================
    def test_register_user_success_lab_manager(self):
        payload = {
            "username": "new_pathologist",
            "password": "SecurePassword123!",
            "role": "pathologist",
            "email": "pathologist@example.com",
        }
        res = self.client.post(
            "/auth/register",
            json=payload,
            headers={"Authorization": f"Bearer {self.manager_token}"},
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["username"], "new_pathologist")
        self.assertEqual(data["email"], "pathologist@example.com")
        self.assertEqual(data["role"], "pathologist")
        self.assertFalse(data["is_locked"])
        self.assertEqual(data["failed_attempts"], 0)
        self.assertNotIn("password", data)
        self.assertNotIn("password_hash", data)

        # Verify password in DB is hashed with bcrypt
        user_in_db = self.db.query(User).filter(User.username == "new_pathologist").first()
        self.assertIsNotNone(user_in_db)
        self.assertTrue(user_in_db.password_hash.startswith("$2b$") or user_in_db.password_hash.startswith("$2a$") or user_in_db.password_hash.startswith("$2y$"))
        self.assertTrue(verify_password("SecurePassword123!", user_in_db.password_hash))

        # Verify activity log
        log = self.db.query(ActivityLog).filter(ActivityLog.action == "user_registered").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.user_id, 1)
        self.assertEqual(log.resource_type, "user")
        self.assertIn("new_pathologist", log.details)

    def test_register_user_forbidden_for_non_manager(self):
        payload = {
            "username": "unauthorized_user",
            "password": "Password123!",
            "role": "technician",
        }
        res = self.client.post(
            "/auth/register",
            json=payload,
            headers={"Authorization": f"Bearer {self.tech_token}"},
        )
        self.assertEqual(res.status_code, 403)

    def test_register_user_duplicate_username_returns_409(self):
        payload = {
            "username": "manager_jane",  # Already exists
            "password": "Password123!",
            "role": "technician",
        }
        res = self.client.post(
            "/auth/register",
            json=payload,
            headers={"Authorization": f"Bearer {self.manager_token}"},
        )
        self.assertEqual(res.status_code, 409)
        self.assertIn("Username already exists", res.json()["detail"])

    def test_register_user_invalid_role_returns_422(self):
        payload = {
            "username": "invalid_role_user",
            "password": "Password123!",
            "role": "super_admin_does_not_exist",
        }
        res = self.client.post(
            "/auth/register",
            json=payload,
            headers={"Authorization": f"Bearer {self.manager_token}"},
        )
        self.assertEqual(res.status_code, 422)

    # ============================================================
    # Ticket SXFT5-35: POST /auth/unlock/{user_id} endpoint (Lab Manager only)
    # ============================================================
    def test_unlock_user_success_lab_manager(self):
        res = self.client.post(
            "/auth/unlock/4",
            headers={"Authorization": f"Bearer {self.manager_token}"},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertFalse(data["is_locked"])
        self.assertEqual(data["failed_attempts"], 0)
        self.assertEqual(data["user_id"], 4)

        # Verify DB state
        unlocked = self.db.query(User).filter(User.id == 4).first()
        self.assertFalse(unlocked.is_locked)
        self.assertEqual(unlocked.failed_attempts, 0)
        self.assertIsNone(unlocked.locked_until)

        # Verify activity log
        log = self.db.query(ActivityLog).filter(ActivityLog.action == "user_unlocked").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.user_id, 1)
        self.assertEqual(log.resource_id, "4")

    def test_unlock_user_forbidden_for_non_manager(self):
        res = self.client.post(
            "/auth/unlock/4",
            headers={"Authorization": f"Bearer {self.collector_token}"},
        )
        self.assertEqual(res.status_code, 403)

    def test_unlock_user_not_found_returns_404(self):
        res = self.client.post(
            "/auth/unlock/99999",
            headers={"Authorization": f"Bearer {self.manager_token}"},
        )
        self.assertEqual(res.status_code, 404)

    # ============================================================
    # Ticket SXFT5-38: DELETE /patients/{id} endpoint
    # ============================================================
    def test_delete_patient_success_204(self):
        res = self.client.delete(
            "/patients/102",
            headers={"Authorization": f"Bearer {self.manager_token}"},
        )
        self.assertEqual(res.status_code, 204)

        # Verify record is deleted
        deleted = self.db.query(Patient).filter(Patient.id == 102).first()
        self.assertIsNone(deleted)

        # Verify activity log
        log = self.db.query(ActivityLog).filter(ActivityLog.action == "delete_patient").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.user_id, 1)
        self.assertEqual(log.resource_id, "102")

    def test_delete_patient_not_found_returns_404(self):
        res = self.client.delete(
            "/patients/99999",
            headers={"Authorization": f"Bearer {self.manager_token}"},
        )
        self.assertEqual(res.status_code, 404)

    def test_delete_patient_forbidden_for_non_manager(self):
        res = self.client.delete(
            "/patients/102",
            headers={"Authorization": f"Bearer {self.collector_token}"},
        )
        self.assertEqual(res.status_code, 403)

    def test_delete_patient_blocked_with_linked_tests_returns_400(self):
        # Patient 101 has test 201 linked
        res = self.client.delete(
            "/patients/101",
            headers={"Authorization": f"Bearer {self.manager_token}"},
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("linked lab test", res.json()["detail"].lower())

        # Patient still exists
        patient = self.db.query(Patient).filter(Patient.id == 101).first()
        self.assertIsNotNone(patient)

    # ============================================================
    # Ticket SXFT5-39: GET /patients/{id} live data endpoint
    # ============================================================
    def test_get_patient_detail_success(self):
        res = self.client.get(
            "/patients/101",
            headers={"Authorization": f"Bearer {self.tech_token}"},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["id"], 101)
        self.assertEqual(data["name"], "Alice Smith")
        self.assertEqual(data["dob"], "1988-06-15")
        self.assertEqual(data["address"], "123 Health Ave, Tucson, AZ")
        self.assertEqual(data["phone"], "520-555-0101")
        self.assertEqual(data["email"], "alice.smith@example.com")
        self.assertEqual(data["insurance_provider"], "Blue Cross Blue Shield")
        self.assertEqual(data["policy_number"], "BCBS-987654")
        self.assertEqual(len(data["tests"]), 1)
        self.assertEqual(data["tests"][0]["test_name"], "Comprehensive Metabolic Panel")

    def test_get_patient_detail_not_found_returns_404(self):
        res = self.client.get(
            "/patients/99999",
            headers={"Authorization": f"Bearer {self.tech_token}"},
        )
        self.assertEqual(res.status_code, 404)


if __name__ == "__main__":
    unittest.main()
