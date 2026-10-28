import os
import unittest

TEST_DB_FILE = "test_register.db"
os.environ["SECRET_KEY"] = "test-secret-key-for-unit-testing-32charsmin"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_FILE}"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.models.user import User
from app.routers import auth
from app.security import create_access_token, password_hash, verify_password

test_engine = create_engine(f"sqlite:///{TEST_DB_FILE}", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


class TestRegister(unittest.TestCase):
    def setUp(self):
        Base.metadata.drop_all(bind=test_engine)
        Base.metadata.create_all(bind=test_engine)
        self.db = TestingSessionLocal()
        self.db.add_all([
            User(id=1, email="manager@example.com", role="lab_manager",
                 password_hash=password_hash.hash("managerpass1")),
            User(id=2, email="tech@example.com", role="lab_technician",
                 password_hash=password_hash.hash("techpass123")),
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

    def payload(self, **over):
        return {"email": "New@Example.com", "password": "s3cretpass!", "role": "pathologist", **over}

    def test_requires_authentication(self):
        r = self.client.post("/auth/register", json=self.payload())
        self.assertEqual(r.status_code, 401)

    def test_non_manager_forbidden(self):
        r = self.client.post("/auth/register", json=self.payload(), headers=self.tech_hdr)
        self.assertEqual(r.status_code, 403)
        self.assertIsNone(self.db.query(User).filter_by(email="new@example.com").first())

    def test_manager_creates_account(self):
        r = self.client.post("/auth/register", json=self.payload(), headers=self.manager_hdr)
        self.assertEqual(r.status_code, 201)
        body = r.json()
        self.assertEqual(set(body), {"id", "email", "role"})  # no password or hash returned
        self.assertEqual(body["email"], "new@example.com")
        self.assertEqual(body["role"], "pathologist")
        self.assertNotIn("s3cretpass!", r.text)

        user = self.db.query(User).filter_by(email="new@example.com").one()
        self.assertEqual(user.failed_login_attempts, 0)
        self.assertIsNone(user.locked_until)

    def test_password_stored_as_bcrypt_hash(self):
        self.client.post("/auth/register", json=self.payload(), headers=self.manager_hdr)
        user = self.db.query(User).filter_by(email="new@example.com").one()
        self.assertTrue(user.password_hash.startswith("$2"))
        self.assertNotEqual(user.password_hash, "s3cretpass!")
        self.assertTrue(verify_password("s3cretpass!", user.password_hash))

    def test_new_user_can_log_in(self):
        self.client.post("/auth/register", json=self.payload(), headers=self.manager_hdr)
        r = self.client.post("/auth/login", json={"email": "new@example.com", "password": "s3cretpass!"})
        self.assertEqual(r.status_code, 200)

    def test_legacy_argon2_user_can_still_log_in(self):
        from pwdlib import PasswordHash
        from pwdlib.hashers.argon2 import Argon2Hasher
        legacy = PasswordHash((Argon2Hasher(),)).hash("legacypass1")
        self.db.add(User(id=3, email="legacy@example.com", role="billing", password_hash=legacy))
        self.db.commit()
        r = self.client.post("/auth/login", json={"email": "legacy@example.com", "password": "legacypass1"})
        self.assertEqual(r.status_code, 200)

    def test_duplicate_email_rejected(self):
        r = self.client.post("/auth/register", json=self.payload(email="TECH@example.com"), headers=self.manager_hdr)
        self.assertEqual(r.status_code, 400)

    def test_invalid_role_rejected(self):
        r = self.client.post("/auth/register", json=self.payload(role="superadmin"), headers=self.manager_hdr)
        self.assertEqual(r.status_code, 422)

    def test_role_is_required(self):
        body = self.payload()
        del body["role"]
        r = self.client.post("/auth/register", json=body, headers=self.manager_hdr)
        self.assertEqual(r.status_code, 422)

    def test_password_length_rules(self):
        short = self.client.post("/auth/register", json=self.payload(password="short"), headers=self.manager_hdr)
        long_ = self.client.post("/auth/register", json=self.payload(password="a" * 73), headers=self.manager_hdr)
        self.assertEqual(short.status_code, 422)
        self.assertEqual(long_.status_code, 422)

    def test_password_not_logged(self):
        with self.assertLogs("uvicorn.error", level="INFO") as logs:
            self.client.post("/auth/register", json=self.payload(), headers=self.manager_hdr)
        joined = "\n".join(logs.output)
        self.assertNotIn("s3cretpass!", joined)
        self.assertNotIn("$2", joined)


if __name__ == "__main__":
    unittest.main()
