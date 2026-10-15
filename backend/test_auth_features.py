import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

TEST_DB_FILE = "/tmp/test_auth.db" if os.path.exists("/tmp") else "test_auth.db"
os.environ["SECRET_KEY"] = "test-secret-key-for-unit-testing-32charsmin"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_FILE}"

from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.models.user import User
from app.security import create_access_token, password_hash
from app.notifications import emit_lockout_notification
from app.dependencies import get_current_user, require_role
from app.routers import auth

test_engine = create_engine(
    f"sqlite:///{TEST_DB_FILE}",
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)



class TestAuthFoundation(unittest.TestCase):
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
        # Refresh tables for each test
        Base.metadata.drop_all(bind=test_engine)
        Base.metadata.create_all(bind=test_engine)

        self.db = TestingSessionLocal()

        # Seed test users in SQLite database
        self.user_tech = User(
            id=1,
            email="tech@example.com",
            password_hash=password_hash.hash("techpass123"),
            role="technician",
            failed_login_attempts=0,
            locked_until=None,
        )
        self.user_manager = User(
            id=2,
            email="manager@example.com",
            password_hash=password_hash.hash("managerpass123"),
            role="lab_manager",
            failed_login_attempts=0,
            locked_until=None,
        )
        self.db.add(self.user_tech)
        self.db.add(self.user_manager)
        self.db.commit()

        # Build test FastAPI app
        self.app = FastAPI()
        self.app.include_router(auth.router)

        def override_get_db():
            db = TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[get_db] = override_get_db

        # Test route using get_current_user
        @self.app.get("/test/protected")
        def protected_route(user: User = Depends(get_current_user)):
            return {"user_id": user.id, "email": user.email, "role": user.role}

        # Test route using require_role("lab_manager")
        @self.app.get("/test/manager-only")
        def manager_only_route(user: User = Depends(require_role("lab_manager"))):
            return {"message": "Welcome manager", "user_id": user.id}

        # Test route using require_role with multiple roles
        @self.app.get("/test/staff-only")
        def staff_route(user: User = Depends(require_role("lab_manager", "technician"))):
            return {"message": "Welcome staff", "role": user.role}

        self.client = TestClient(self.app)

    def tearDown(self):
        self.db.close()
        self.app.dependency_overrides.clear()

    # ==========================================
    # Ticket SXFT5-31: Lockout notification tests
    # ==========================================
    def test_emit_lockout_notification(self):
        locked_time = datetime.now(timezone.utc) + timedelta(minutes=15)
        with patch("app.notifications.logger.warning") as mock_log:
            event = emit_lockout_notification(
                user_id=1,
                email="tech@example.com",
                locked_until=locked_time,
            )
            self.assertEqual(event["event"], "account_lockout")
            self.assertEqual(event["user_id"], 1)
            self.assertEqual(event["email"], "tech@example.com")
            self.assertEqual(event["recipient_role"], "lab_manager")
            self.assertIn("tech@example.com", event["message"])
            self.assertIn("Lab Manager notified", event["message"])
            mock_log.assert_called_once()

    def test_failed_logins_trigger_lockout_notification(self):
        # Reset tech@example.com fake user state
        auth._FAKE_USERS["tech@example.com"]["failed_login_attempts"] = 0
        auth._FAKE_USERS["tech@example.com"]["locked_until"] = None

        with patch("app.routers.auth.emit_lockout_notification") as mock_notify:
            # 4 failed attempts: not yet locked
            for i in range(4):
                res = self.client.post(
                    "/auth/login",
                    json={"email": "tech@example.com", "password": "wrongpassword"},
                )
                self.assertEqual(res.status_code, 401)
                mock_notify.assert_not_called()

            # 5th failed attempt: triggers lockout and notification
            res = self.client.post(
                "/auth/login",
                json={"email": "tech@example.com", "password": "wrongpassword"},
            )
            self.assertEqual(res.status_code, 423)
            self.assertIn("Account temporarily locked", res.json()["detail"])
            mock_notify.assert_called_once()
            call_kwargs = mock_notify.call_args[1]
            self.assertEqual(call_kwargs["email"], "tech@example.com")
            self.assertEqual(call_kwargs["user_id"], 1)
            self.assertIsNotNone(call_kwargs["locked_until"])

    # ==========================================
    # Ticket SXFT5-33: get_current_user() tests
    # ==========================================
    def test_get_current_user_success(self):
        token = create_access_token(sub="1", role="technician")
        response = self.client.get(
            "/test/protected",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["user_id"], 1)
        self.assertEqual(data["email"], "tech@example.com")
        self.assertEqual(data["role"], "technician")

    def test_get_current_user_by_email_sub(self):
        token = create_access_token(sub="manager@example.com", role="lab_manager")
        response = self.client.get(
            "/test/protected",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["user_id"], 2)
        self.assertEqual(data["email"], "manager@example.com")

    def test_get_current_user_missing_header(self):
        response = self.client.get("/test/protected")
        self.assertEqual(response.status_code, 401)
        self.assertIn("Not authenticated", response.json()["detail"])

    def test_get_current_user_invalid_scheme(self):
        token = create_access_token(sub="1", role="technician")
        response = self.client.get(
            "/test/protected",
            headers={"Authorization": f"Basic {token}"},
        )
        self.assertEqual(response.status_code, 401)

    def test_get_current_user_invalid_token(self):
        response = self.client.get(
            "/test/protected",
            headers={"Authorization": "Bearer not-a-valid-jwt-token"},
        )
        self.assertEqual(response.status_code, 401)

    def test_get_current_user_expired_token(self):
        expired_token = create_access_token(
            sub="1", role="technician", expires_delta=timedelta(seconds=1)
        )
        # Sleep or test token with past expiration
        import time
        time.sleep(1.2)
        response = self.client.get(
            "/test/protected",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        self.assertEqual(response.status_code, 401)
        self.assertIn("expired", response.json()["detail"].lower())

    def test_get_current_user_not_in_db(self):
        token = create_access_token(sub="9999", role="technician")
        response = self.client.get(
            "/test/protected",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 401)
        self.assertIn("User not found", response.json()["detail"])

    def test_auth_me_endpoint(self):
        token = create_access_token(sub="2", role="lab_manager")
        response = self.client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["email"], "manager@example.com")
        self.assertEqual(response.json()["role"], "lab_manager")

    # ==========================================
    # Ticket SXFT5-36: require_role() tests
    # ==========================================
    def test_require_role_authorized(self):
        manager_token = create_access_token(sub="2", role="lab_manager")
        response = self.client.get(
            "/test/manager-only",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user_id"], 2)

    def test_require_role_forbidden_for_other_role(self):
        tech_token = create_access_token(sub="1", role="technician")
        response = self.client.get(
            "/test/manager-only",
            headers={"Authorization": f"Bearer {tech_token}"},
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("Operation not permitted", response.json()["detail"])

    def test_require_role_multiple_allowed_roles(self):
        manager_token = create_access_token(sub="2", role="lab_manager")
        tech_token = create_access_token(sub="1", role="technician")

        res_mgr = self.client.get(
            "/test/staff-only",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        self.assertEqual(res_mgr.status_code, 200)

        res_tech = self.client.get(
            "/test/staff-only",
            headers={"Authorization": f"Bearer {tech_token}"},
        )
        self.assertEqual(res_tech.status_code, 200)

    def test_require_role_unauthenticated(self):
        response = self.client.get("/test/manager-only")
        # Unauthenticated users should be stopped with 401, not 403
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
