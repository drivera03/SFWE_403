import os
import unittest
from datetime import datetime, timedelta, timezone

TEST_DB_FILE = "test_unlock.db"
os.environ["SECRET_KEY"] = "test-secret-key-for-unit-testing-32charsmin"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_FILE}"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.models.user import User
from app.routers import auth
from app.security import create_access_token, password_hash

test_engine = create_engine(f"sqlite:///{TEST_DB_FILE}", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


class TestUnlock(unittest.TestCase):
    def setUp(self):
        Base.metadata.drop_all(bind=test_engine)
        Base.metadata.create_all(bind=test_engine)
        self.db = TestingSessionLocal()
        self.db.add_all([
            User(id=1, email="manager@example.com", role="lab_manager",
                 password_hash=password_hash.hash("managerpass1")),
            User(id=2, email="tech@example.com", role="lab_technician",
                 password_hash=password_hash.hash("techpass123")),
            User(id=3, email="locked@example.com", role="billing",
                 password_hash=password_hash.hash("lockedpass1"),
                 failed_login_attempts=5,
                 locked_until=datetime.now(timezone.utc) + timedelta(minutes=10)),
        ])
        self.db.commit()

        app = FastAPI()
        app.include_router(auth.router)

        def override_get_db():
            db = TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)
        self.manager_hdr = {"Authorization": f"Bearer {create_access_token('1', 'lab_manager')}"}
        self.tech_hdr = {"Authorization": f"Bearer {create_access_token('2', 'lab_technician')}"}

    def tearDown(self):
        self.db.close()

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=test_engine)
        test_engine.dispose()
        if os.path.exists(TEST_DB_FILE):
            os.remove(TEST_DB_FILE)

    def locked_user(self):
        self.db.expire_all()
        return self.db.get(User, 3)

    def test_requires_authentication(self):
        r = self.client.post("/auth/unlock/3")
        self.assertEqual(r.status_code, 401)
        self.assertEqual(self.locked_user().failed_login_attempts, 5)

    def test_non_manager_forbidden(self):
        r = self.client.post("/auth/unlock/3", headers=self.tech_hdr)
        self.assertEqual(r.status_code, 403)
        user = self.locked_user()
        self.assertEqual(user.failed_login_attempts, 5)
        self.assertIsNotNone(user.locked_until)

    def test_unknown_user_404(self):
        r = self.client.post("/auth/unlock/999", headers=self.manager_hdr)
        self.assertEqual(r.status_code, 404)

    def test_manager_unlocks_account(self):
        r = self.client.post("/auth/unlock/3", headers=self.manager_hdr)
        self.assertEqual(r.status_code, 204)
        user = self.locked_user()
        self.assertEqual(user.failed_login_attempts, 0)
        self.assertIsNone(user.locked_until)

    def test_locked_login_blocked_then_allowed_after_unlock(self):
        creds = {"email": "locked@example.com", "password": "lockedpass1"}
        self.assertEqual(self.client.post("/auth/login", json=creds).status_code, 423)
        self.client.post("/auth/unlock/3", headers=self.manager_hdr)
        self.assertEqual(self.client.post("/auth/login", json=creds).status_code, 200)

    def test_unlocking_unlocked_account_is_harmless(self):
        r = self.client.post("/auth/unlock/2", headers=self.manager_hdr)
        self.assertEqual(r.status_code, 204)
        self.db.expire_all()
        self.assertEqual(self.db.get(User, 2).failed_login_attempts, 0)

    def test_unlock_is_logged(self):
        with self.assertLogs("uvicorn.error", level="INFO") as logs:
            self.client.post("/auth/unlock/3", headers=self.manager_hdr)
        line = next(l for l in logs.output if "Account unlocked" in l)
        self.assertIn("user_id=3", line)
        self.assertIn("by=1", line)
        self.assertIn("was_locked=True", line)
        self.assertNotIn("locked@example.com", line)

    def test_failed_unlock_attempts_not_logged_as_unlocks(self):
        with self.assertNoLogs("uvicorn.error", level="INFO"):
            self.client.post("/auth/unlock/3", headers=self.tech_hdr)


if __name__ == "__main__":
    unittest.main()
