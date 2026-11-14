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

    def test_timestamps_are_explicitly_utc(self):
        entry = self.client.get("/activity-logs", params={"limit": 1}).json()[0]
        self.assertTrue(entry["timestamp"].endswith(("Z", "+00:00")), entry["timestamp"])

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

    def test_tz_offset_shifts_day_boundaries(self):
        # Arizona (UTC-7, offset 420): local Oct 1 runs 2026-10-01 07:00Z to 2026-10-02 07:00Z,
        # so the 00:00Z entry on Oct 2 is the evening of Oct 1 locally.
        self.assertEqual(self.ids(date="2026-10-01", tz_offset=420), [2, 1])
        self.assertEqual(self.ids(date="2026-10-02", tz_offset=420), [4, 3])

    # Search
    def test_search_matches_action_details_and_user(self):
        self.assertEqual(self.ids(search="PATIENT_created"), [3, 1])  # case-insensitive
        self.assertEqual(self.ids(search="lipid"), [2])                # inside JSON details
        self.assertEqual(self.ids(search="tech@"), [3, 2])             # user email
        self.assertEqual(self.ids(search="mason"), [4, 1])             # username

    def test_search_combines_with_filters(self):
        self.assertEqual(self.ids(search="patient", user_id=1), [1])

    def test_search_treats_wildcards_literally(self):
        self.assertEqual(self.ids(search="%"), [])
        self.assertEqual(self.ids(search="_"), [5, 4, 3, 2, 1])  # every action has a real underscore

    def test_blank_search_is_ignored(self):
        self.assertEqual(self.ids(search="   "), [5, 4, 3, 2, 1])

    # Dropdown endpoints
    def test_actions_endpoint(self):
        response = self.client.get("/activity-logs/actions")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            ["inventory_removed", "patient_created", "system_event", "test_created"],
        )

    def test_users_endpoint_lists_only_logged_users(self):
        db = TestingSession()
        db.add(User(id=3, username="quiet", email="quiet@example.com", role="cashier", password_hash="x"))
        db.commit()
        db.close()
        users = self.client.get("/activity-logs/users").json()
        self.assertEqual([u["username"] for u in users], ["mason", "tech"])
        self.assertEqual(set(users[0]), {"id", "username", "email", "role"})  # no password hash

    def test_dropdown_endpoints_only_lab_manager(self):
        login_as("technician")
        self.assertEqual(self.client.get("/activity-logs/actions").status_code, 403)
        self.assertEqual(self.client.get("/activity-logs/users").status_code, 403)

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
