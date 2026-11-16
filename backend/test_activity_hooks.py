import os
os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-testing-32charsmin")

import json
import unittest
from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.activity_hooks import (
    INVENTORY_RECEIVED,
    INVENTORY_REMOVED,
    PURCHASE_COMPLETED,
    RESULT_ENTERED,
    RESULT_STATUS_CHANGED,
    RESULT_UPDATED,
    log_inventory_change,
    log_purchase,
    log_result_changes,
    snapshot_result,
)
from app.database import Base, get_db
from app.dependencies import get_current_user
from app.main import app
from app import models  # noqa: F401  (registers tables)
from app.models.activity_log import ActivityLog
from app.models.inventory import InventoryItem
from app.models.patient import Patient
from app.models.tests import Physician, ResultStatus, SampleType, Test

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


def details_of(entry: ActivityLog) -> dict:
    return json.loads(entry.details)


class HookTestCase(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        self.db = TestingSession()
        patient = Patient(first_name="Ana", last_name="Lopez")
        physician = Physician(name="Dr. House")
        self.db.add_all([patient, physician])
        self.db.flush()
        self.item = InventoryItem(item_name="Lipid Reagent Kit", lot_number="LOT-A", batch_number="B-1",
                                  quantity=5, reorder_threshold=10, expiration_date=date(2027, 1, 31))
        self.test = Test(report_id="R1", sample_id="S1", patient_id=patient.id, physician_id=physician.id,
                         sample_type=SampleType.BLOOD, collection_datetime=datetime(2026, 11, 1, 9, 0),
                         collected_by_id=1, test_name="Lipid Panel", units="mg/dL")
        self.db.add_all([self.item, self.test])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(engine)

    def logs(self, action=None):
        query = self.db.query(ActivityLog).order_by(ActivityLog.id)
        if action:
            query = query.filter(ActivityLog.action == action)
        return query.all()


class TestInventoryHook(HookTestCase):
    def test_records_user_action_timestamp_and_quantities(self):
        self.item.quantity = 25
        log_inventory_change(self.db, 7, INVENTORY_RECEIVED, self.item, previous_quantity=5,
                             extra={"supplier": "Acme Lab Supply"})
        self.db.commit()

        entry = self.logs(INVENTORY_RECEIVED)[0]
        self.assertEqual(entry.user_id, 7)
        self.assertIsNotNone(entry.timestamp)
        self.assertEqual((entry.resource_type, entry.resource_id), ("inventory", str(self.item.id)))
        details = details_of(entry)
        self.assertEqual(details["item_name"], "Lipid Reagent Kit")
        self.assertEqual(details["lot_number"], "LOT-A")
        self.assertEqual(details["expiration_date"], "2027-01-31")
        self.assertEqual((details["previous_quantity"], details["quantity"], details["quantity_change"]), (5, 25, 20))
        self.assertEqual(details["supplier"], "Acme Lab Supply")

    def test_entry_is_part_of_callers_transaction(self):
        # If the change is rolled back, its log entry must disappear with it.
        self.item.quantity = 0
        log_inventory_change(self.db, 7, INVENTORY_REMOVED, self.item, reason="spilled")
        self.db.rollback()
        self.assertEqual(self.logs(), [])
        self.assertEqual(self.db.get(InventoryItem, self.item.id).quantity, 5)

    def test_rejects_unknown_action(self):
        with self.assertRaises(ValueError):
            log_inventory_change(self.db, 7, "inventory_teleported", self.item)

    def test_requires_user(self):
        with self.assertRaises(ValueError):
            log_inventory_change(self.db, None, INVENTORY_RECEIVED, self.item)


class TestPurchaseHook(HookTestCase):
    def test_records_purchase(self):
        log_purchase(self.db, 3, 42, total=Decimal("125.50"), payment_method="credit",
                     patient_id=self.test.patient_id, test_ids=[self.test.id])
        self.db.commit()

        entry = self.logs(PURCHASE_COMPLETED)[0]
        self.assertEqual(entry.user_id, 3)
        self.assertIsNotNone(entry.timestamp)
        self.assertEqual((entry.resource_type, entry.resource_id), ("purchase", "42"))
        self.assertEqual(
            details_of(entry),
            {"total": 125.5, "payment_method": "credit", "patient_id": self.test.patient_id,
             "test_ids": [self.test.id]},
        )

    def test_requires_user(self):
        with self.assertRaises(ValueError):
            log_purchase(self.db, None, 1, total=10, payment_method="cash")


class TestResultHook(HookTestCase):
    def change(self, **fields):
        before = snapshot_result(self.test)
        for field, value in fields.items():
            setattr(self.test, field, value)
        entries = log_result_changes(self.db, 9, self.test, before)
        self.db.commit()
        return [e.action for e in entries]

    def test_first_result_and_status(self):
        self.assertEqual(
            self.change(result_numeric=180.0, status=ResultStatus.COMPLETED),
            [RESULT_ENTERED, RESULT_STATUS_CHANGED],
        )
        entered, status_change = self.logs()
        self.assertEqual(entered.user_id, 9)
        self.assertEqual(details_of(entered)["result_numeric"], 180.0)
        self.assertEqual(details_of(entered)["units"], "mg/dL")
        self.assertNotIn("previous_result_numeric", details_of(entered))
        self.assertEqual(details_of(status_change)["previous_status"], "pending")
        self.assertEqual(details_of(status_change)["status"], "completed")

    def test_correcting_a_result_records_previous_value(self):
        self.change(result_numeric=180.0, status=ResultStatus.COMPLETED)
        self.assertEqual(self.change(result_numeric=190.0), [RESULT_UPDATED])
        details = details_of(self.logs(RESULT_UPDATED)[0])
        self.assertEqual((details["previous_result_numeric"], details["result_numeric"]), (180.0, 190.0))

    def test_same_value_is_not_logged(self):
        self.change(result_numeric=180.0, status=ResultStatus.COMPLETED)
        # The DB returns a Decimal; resending the same float is not a change.
        self.db.refresh(self.test)
        self.assertIsInstance(self.test.result_numeric, Decimal)
        self.assertEqual(self.change(result_numeric=180.0, status=ResultStatus.COMPLETED), [])

    def test_text_result(self):
        self.assertEqual(self.change(result_text="Absent", status=ResultStatus.COMPLETED),
                         [RESULT_ENTERED, RESULT_STATUS_CHANGED])

    def test_validation_only_changes_status(self):
        self.change(result_numeric=180.0, status=ResultStatus.COMPLETED)
        self.assertEqual(self.change(status=ResultStatus.VALIDATED), [RESULT_STATUS_CHANGED])


class TestEndpointsWriteLogs(HookTestCase):
    """The hooks wired into the existing endpoints."""

    def setUp(self):
        super().setUp()
        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=4, role="technician")
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        super().tearDown()

    def put_test(self, **body):
        response = self.client.put(f"/tests/{self.test.id}", json=body)
        self.db.expire_all()
        return response

    def actions(self):
        return [entry.action for entry in self.logs()]

    def test_entering_a_result(self):
        self.assertEqual(self.put_test(result_numeric=180, status="completed").status_code, 200)
        self.assertEqual(self.actions(), [RESULT_ENTERED, RESULT_STATUS_CHANGED])
        self.assertTrue(all(entry.user_id == 4 for entry in self.logs()))

    def test_full_result_lifecycle(self):
        self.put_test(result_numeric=180, status="completed")
        self.put_test(result_numeric=185)
        self.put_test(status="validated")
        self.assertEqual(
            self.actions(),
            [RESULT_ENTERED, RESULT_STATUS_CHANGED, RESULT_UPDATED, RESULT_STATUS_CHANGED],
        )

    def test_notes_only_edit_is_still_test_updated(self):
        self.put_test(notes="hemolyzed sample")
        self.assertEqual(self.actions(), ["test_updated"])
        self.assertEqual(details_of(self.logs()[0])["updated_fields"], ["notes"])

    def test_result_and_notes_in_one_request(self):
        self.put_test(result_text="Absent", notes="rechecked")
        self.assertEqual(self.actions(), [RESULT_ENTERED, "test_updated"])

    def test_rejected_update_writes_no_log(self):
        # Completing without a result is refused, so nothing should be logged.
        self.assertEqual(self.put_test(status="completed").status_code, 422)
        self.assertEqual(self.actions(), [])

    def test_inventory_removal_logs_through_hook(self):
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, role="lab_manager")
        item_id = self.item.id
        response = self.client.delete(f"/inventory/{item_id}", params={"reason": "expired"})
        self.assertEqual(response.status_code, 204)
        self.db.expire_all()
        entry = self.logs(INVENTORY_REMOVED)[0]
        self.assertEqual(entry.user_id, 1)
        self.assertEqual(details_of(entry)["reason"], "expired")
        self.assertEqual(details_of(entry)["item_name"], "Lipid Reagent Kit")
        self.assertIsNone(self.db.query(InventoryItem).filter_by(id=item_id).first())


if __name__ == "__main__":
    unittest.main()
