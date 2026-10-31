"""Public signup regressions, including login and privileged role protection."""
import os
import unittest

os.environ.setdefault("SECRET_KEY", "signup-test-secret-key-at-least-32-characters")
os.environ.setdefault("DATABASE_URL", "sqlite://")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.user import User
from app.models.activity_log import ActivityLog
from app.routers import auth
from app.security import verify_password


class TestSignup(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        app = FastAPI()
        app.include_router(auth.router)

        def database():
            with self.sessions() as db:
                yield db

        app.dependency_overrides[get_db] = database
        self.client = TestClient(app)
        self.payload = {"email": " New@Example.com ", "password": "signup-pass123"}

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def test_public_signup_and_login(self):
        response = self.client.post("/auth/signup", json=self.payload)
        self.assertEqual(response.status_code, 201, response.text)
        data = response.json()
        self.assertEqual(data["email"], "new@example.com")
        self.assertEqual(data["role"], "technician")
        self.assertNotIn("password", response.text)
        with self.sessions() as db:
            user = db.query(User).one()
            self.assertTrue(verify_password(self.payload["password"], user.password_hash))
            self.assertEqual(db.query(ActivityLog).one().user_id, user.id)
        login = self.client.post("/auth/login", json={"email": data["email"], "password": self.payload["password"]})
        self.assertEqual(login.status_code, 200)
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        self.assertEqual(self.client.get("/auth/me", headers=headers).status_code, 200)
        self.assertEqual(self.client.post("/auth/register", headers=headers, json={**self.payload, "role": "lab_manager"}).status_code, 403)

    def test_duplicate_email(self):
        self.client.post("/auth/signup", json=self.payload)
        response = self.client.post("/auth/signup", json={**self.payload, "email": "NEW@example.com"})
        self.assertEqual(response.status_code, 409)

    def test_same_email_local_part_can_register(self):
        self.client.post("/auth/signup", json=self.payload)
        response = self.client.post("/auth/signup", json={**self.payload, "email": "new@another.com"})
        self.assertEqual(response.status_code, 201)

    def test_cannot_choose_role(self):
        response = self.client.post("/auth/signup", json={**self.payload, "role": "lab_manager"})
        self.assertEqual(response.status_code, 422)
        with self.sessions() as db:
            self.assertEqual(db.query(User).count(), 0)

    def test_invalid_inputs(self):
        for changes in ({"email": ""}, {"email": "bad-email"}, {"password": "short"}, {"password": "a" * 73}, {"password": "é" * 37}):
            with self.subTest(changes=changes):
                self.assertEqual(self.client.post("/auth/signup", json={**self.payload, **changes}).status_code, 422)

    def test_manager_registration_still_requires_auth(self):
        self.assertEqual(self.client.post("/auth/register", json={**self.payload, "role": "lab_manager"}).status_code, 401)


if __name__ == "__main__":
    unittest.main()
