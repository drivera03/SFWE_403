import os
os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-testing-32charsmin")

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.dependencies import get_current_user
from app.main import app
from app import models  # noqa: F401  (registers tables)
from app.models.activity_log import ActivityLog
from app.models.user import User

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


def login_as(role):
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, role=role)


def utc(*args):
    return datetime(*args, tzinfo=timezone.utc)


class TestActivityLogs(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        app.dependency_overrides[get_db] = override_get_db
        login_as("lab_manager")
        self.client = TestClient(app)

        db = TestingSession()
        db.add_all([
            User(id=1, username="mason", email="mason@example.com", role="lab_manager", password_hash="x"),
            User(id=2, username="tech", email="tech@example.com", role="technician", password_hash="x"),
        ])
        db.add_all([
            ActivityLog(id=1, user_id=1, action="patient_created", resource_type="patient", resource_id="10",
                        details='{"name": "Ana Lopez"}', timestamp=utc(2026, 10, 1, 9, 0)),
            ActivityLog(id=2, user_id=2, action="test_created", resource_type="test", resource_id="20",
                        details='{"test_name": "Lipid Panel"}', timestamp=utc(2026, 10, 2, 0, 0)),
            ActivityLog(id=3, user_id=2, action="patient_created", resource_type="patient", resource_id="11",
                        timestamp=utc(2026, 10, 2, 23, 59, 59)),
            ActivityLog(id=4, user_id=1, action="inventory_removed", resource_type="inventory", resource_id="5",
                        details="not json", timestamp=utc(2026, 10, 3, 0, 0)),
            ActivityLog(id=5, user_id=None, action="system_event", timestamp=utc(2026, 10, 5, 12, 0)),
        ])
        db.commit()
        db.close()

    def tearDown(self):
        Base.metadata.drop_all(engine)
        app.dependency_overrides.clear()

    def ids(self, **params):
        response = self.client.get("/activity-logs", params=params)
        self.assertEqual(response.status_code, 200, response.text)
        return [entry["id"] for entry in response.json()]

    # Access control
    def test_requires_login(self):
        app.dependency_overrides.pop(get_current_user)
        self.assertEqual(self.client.get("/activity-logs").status_code, 401)

    def test_only_lab_manager(self):
        for role in ("specimen_collector", "technician", "lab_technician", "pathologist", "billing", "physician", ""):
            with self.subTest(role=role):
                login_as(role)
                self.assertEqual(self.client.get("/activity-logs").status_code, 403)

    # Listing
    def test_lists_all_newest_first(self):
        self.assertEqual(self.ids(), [5, 4, 3, 2, 1])

    def test_entry_shape(self):
        entry = self.client.get("/activity-logs", params={"action": "patient_created", "user_id": 1}).json()[0]
        self.assertEqual(entry["username"], "mason")
        self.assertEqual(entry["email"], "mason@example.com")
        self.assertEqual(entry["resource_type"], "patient")
        self.assertEqual(entry["resource_id"], "10")
        self.assertEqual(entry["details"], {"name": "Ana Lopez"})  # JSON is parsed, not a string

    def test_non_json_details_and_missing_user(self):
        entries = {e["id"]: e for e in self.client.get("/activity-logs").json()}
        self.assertEqual(entries[4]["details"], "not json")
        self.assertIsNone(entries[5]["user_id"])
        self.assertIsNone(entries[5]["username"])

    # Filters
    def test_filter_by_user(self):
        self.assertEqual(self.ids(user_id=2), [3, 2])

    def test_filter_by_action(self):
        self.assertEqual(self.ids(action="patient_created"), [3, 1])

    def test_filter_by_date_includes_whole_day_only(self):
        self.assertEqual(self.ids(date="2026-10-02"), [3, 2])

    def test_filter_by_range_is_inclusive(self):
        self.assertEqual(self.ids(start_date="2026-10-01", end_date="2026-10-02"), [3, 2, 1])

    def test_open_ended_ranges(self):
        self.assertEqual(self.ids(start_date="2026-10-03"), [5, 4])
        self.assertEqual(self.ids(end_date="2026-10-01"), [1])

    def test_filters_combine(self):
        self.assertEqual(self.ids(user_id=2, action="patient_created", date="2026-10-02"), [3])
        self.assertEqual(self.ids(user_id=1, action="test_created"), [])

    def test_pagination(self):
        self.assertEqual(self.ids(limit=2), [5, 4])
        self.assertEqual(self.ids(limit=2, offset=2), [3, 2])

    # Validation
    def test_date_and_range_together_rejected(self):
        response = self.client.get("/activity-logs", params={"date": "2026-10-02", "start_date": "2026-10-01"})
        self.assertEqual(response.status_code, 422)

    def test_start_after_end_rejected(self):
        response = self.client.get("/activity-logs", params={"start_date": "2026-10-03", "end_date": "2026-10-01"})
        self.assertEqual(response.status_code, 422)

    def test_bad_inputs_rejected(self):
        for params in ({"date": "not-a-date"}, {"user_id": "abc"}, {"limit": 0}, {"limit": 501}, {"offset": -1}):
            with self.subTest(params=params):
                self.assertEqual(self.client.get("/activity-logs", params=params).status_code, 422)


if __name__ == "__main__":
    unittest.main()
