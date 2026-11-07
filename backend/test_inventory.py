import os
os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-testing-32charsmin")

import unittest
from datetime import date, datetime, timedelta
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
from app.models.inventory import InventoryItem
from app.models.patient import Patient
from app.models.tests import Instrument, Physician, SampleType, Test

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


class TestInventory(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        app.dependency_overrides[get_db] = override_get_db
        login_as("lab_manager")
        self.client = TestClient(app)

        today = date.today()
        db = TestingSession()
        machine = Instrument(name="Roche Cobas 6000")
        patient = Patient(first_name="Ana", last_name="Lopez")
        physician = Physician(name="Dr. House")
        db.add_all([machine, patient, physician])
        db.flush()
        db.add_all([
            # 1 is below 20% of 10 -> low stock
            InventoryItem(item_name="Lipid Reagent Kit", lot_number="LOT-A", batch_number="B-1",
                          quantity=1, reorder_threshold=10, expiration_date=today + timedelta(days=10),
                          machine_id=machine.id),
            # expired, so it should not count toward availability
            InventoryItem(item_name="Serum Tube", lot_number="LOT-B", quantity=50,
                          reorder_threshold=10, expiration_date=today - timedelta(days=1)),
            # plenty, expires far away
            InventoryItem(item_name="EDTA Tube", lot_number="LOT-C", quantity=100,
                          reorder_threshold=10, expiration_date=today + timedelta(days=90)),
        ])
        db.add(Test(report_id="R1", patient_id=patient.id, physician_id=physician.id,
                    sample_type=SampleType.BLOOD, sample_id="S1", collection_datetime=datetime.now(),
                    collected_by_id=1, instrument_id=machine.id, test_name="Lipid Panel"))
        db.commit()
        db.close()

    def tearDown(self):
        Base.metadata.drop_all(engine)
        app.dependency_overrides.clear()

    def test_low_stock(self):
        res = self.client.get("/inventory/low-stock")
        self.assertEqual(res.status_code, 200)
        self.assertEqual([i["item_name"] for i in res.json()], ["Lipid Reagent Kit"])

    def test_expiring_includes_expired_and_within_30_days(self):
        res = self.client.get("/inventory/expiring")
        self.assertEqual(res.status_code, 200)
        self.assertEqual([i["lot_number"] for i in res.json()], ["LOT-B", "LOT-A"])

    def test_check_availability_fails_on_expired_supply(self):
        login_as("specimen_collector")
        res = self.client.get("/inventory/check-availability", params={"test_name": "Lipid Panel"})
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertFalse(body["available"])
        serum = next(s for s in body["supplies"] if s["item_name"] == "Serum Tube")
        self.assertEqual(serum["available"], 0)

    def test_check_availability_unknown_test(self):
        login_as("specimen_collector")
        res = self.client.get("/inventory/check-availability", params={"test_name": "Nope"})
        self.assertEqual(res.status_code, 404)

    def test_check_availability_only_specimen_collector(self):
        res = self.client.get("/inventory/check-availability", params={"test_name": "Lipid Panel"})
        self.assertEqual(res.status_code, 403)

    def test_lot_lookup(self):
        for number in ("LOT-A", "B-1"):
            res = self.client.get("/inventory/lookup", params={"number": number})
            self.assertEqual(res.status_code, 200)
            self.assertEqual(len(res.json()["items"]), 1)
            self.assertEqual(len(res.json()["tests"]), 1)

    def test_delete_logs_who_and_why(self):
        res = self.client.delete("/inventory/2", params={"reason": "expired"})
        self.assertEqual(res.status_code, 204)
        db = TestingSession()
        self.assertIsNone(db.get(InventoryItem, 2))
        log = db.query(ActivityLog).filter_by(action="inventory_removed").one()
        self.assertEqual(log.user_id, 1)
        self.assertIn("expired", log.details)
        self.assertIsNotNone(log.timestamp)
        db.close()

    def test_delete_requires_reason(self):
        self.assertEqual(self.client.delete("/inventory/2").status_code, 422)

    def test_delete_only_lab_manager(self):
        login_as("technician")
        self.assertEqual(self.client.delete("/inventory/2", params={"reason": "x"}).status_code, 403)


if __name__ == "__main__":
    unittest.main()