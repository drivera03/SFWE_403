import json
import os
os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-testing-32charsmin")

import unittest
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.dependencies import get_current_user
from app.main import app
from app import models  # noqa: F401
from app.models.activity_log import ActivityLog
from app.models.maintenance import MaintenanceLog
from app.models.tests import Instrument

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


def login_as(role):
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, email="tech@example.com", username="tech", role=role)


class TestMaintenance(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        app.dependency_overrides[get_db] = override_get_db
        login_as("technician")
        self.client = TestClient(app)

        db = TestingSession()
        i1 = Instrument(name="Sysmex XN-1000")
        i2 = Instrument(name="Roche Cobas 6000")
        db.add_all([i1, i2])
        db.flush()

        now = datetime.now(timezone.utc)
        today = date.today()
        db.add_all([
            MaintenanceLog(
                instrument_id=i1.id,
                maintenance_type="Calibration",
                maintenance_date=now - timedelta(days=2),
                performed_by_id=1,
                performed_by_name="Tech A",
                status="Passed",
                notes="Calibrated with standard serum.",
                next_due_date=today + timedelta(days=30),
            ),
            MaintenanceLog(
                instrument_id=i2.id,
                maintenance_type="Routine Cleaning",
                maintenance_date=now - timedelta(days=5),
                performed_by_id=1,
                performed_by_name="Tech B",
                status="Completed",
                notes="Rinsed tubing.",
                next_due_date=today + timedelta(days=15),
            ),
        ])
        db.commit()
        db.close()

    def tearDown(self):
        Base.metadata.drop_all(engine)
        app.dependency_overrides.clear()

    def test_list_maintenance_logs(self):
        res = self.client.get("/equipment/maintenance")
        self.assertEqual(res.status_code, 200)
        logs = res.json()
        self.assertEqual(len(logs), 2)
        types = [l["maintenance_type"] for l in logs]
        self.assertIn("Calibration", types)
        self.assertIn("Routine Cleaning", types)

    def test_filter_by_instrument(self):
        res = self.client.get("/equipment/maintenance", params={"instrument_id": 1})
        self.assertEqual(res.status_code, 200)
        logs = res.json()
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0]["instrument"]["name"], "Sysmex XN-1000")

    def test_filter_by_status(self):
        res = self.client.get("/equipment/maintenance", params={"status": "Passed"})
        self.assertEqual(res.status_code, 200)
        logs = res.json()
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0]["status"], "Passed")

    def test_get_single_maintenance_log(self):
        res = self.client.get("/equipment/maintenance/1")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["id"], 1)

    def test_get_maintenance_log_not_found(self):
        res = self.client.get("/equipment/maintenance/999")
        self.assertEqual(res.status_code, 404)

    def test_create_maintenance_log(self):
        res = self.client.post(
            "/equipment/maintenance",
            json={
                "instrument_id": 1,
                "maintenance_type": "Preventative Maintenance",
                "performed_by_name": "Senior Specialist",
                "status": "Completed",
                "notes": "Replaced valve assembly and verified pressure.",
                "next_due_date": "2027-02-01",
            },
        )
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertEqual(body["maintenance_type"], "Preventative Maintenance")
        self.assertEqual(body["status"], "Completed")

        # Verify DB
        db = TestingSession()
        log = db.query(MaintenanceLog).filter_by(maintenance_type="Preventative Maintenance").one()
        self.assertEqual(log.instrument_id, 1)
        self.assertEqual(str(log.next_due_date), "2027-02-01")

        # Verify activity log
        act = db.query(ActivityLog).filter_by(action="equipment_maintenance_logged").first()
        self.assertIsNotNone(act)
        db.close()

    def test_create_maintenance_log_invalid_instrument(self):
        res = self.client.post(
            "/equipment/maintenance",
            json={
                "instrument_id": 9999,
                "maintenance_type": "Calibration",
            },
        )
        self.assertEqual(res.status_code, 404)

    def test_maintenance_unauthorized_for_external_users(self):
        for role in ("patient", "physician"):
            with self.subTest(role=role):
                login_as(role)
                self.assertEqual(self.client.get("/equipment/maintenance").status_code, 403)
                self.assertEqual(
                    self.client.post("/equipment/maintenance", json={"instrument_id": 1, "maintenance_type": "X"}).status_code,
                    403,
                )


if __name__ == "__main__":
    unittest.main()
