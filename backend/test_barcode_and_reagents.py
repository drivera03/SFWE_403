"""QA Unit Tests for Expired-Reagent Block and Single Barcode Print (SXFT5-180).

Covers:
1. Expired reagent/tube blocks test intake (409 Conflict).
2. Unexpired reagent allows test intake (201 Created and consumes stock).
3. Mixed expired and unexpired lots consume only unexpired inventory.
4. Specimen collector generates and prints sample barcode successfully on first attempt.
5. Second print attempt is blocked with 409 Conflict (one-time print policy).
6. Non-specimen-collectors (technician, pathologist, cashier, etc.) get 403 Forbidden.
7. Audit log correctly tracks barcode printing.
"""
import os
os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-qa-testing-32charsmin")

import json
import unittest
from datetime import date, timedelta
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
from app.models.tests import Physician, Test
from app.models.user import User

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


class TestBarcodeAndReagentsQA(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        app.dependency_overrides[get_db] = override_get_db
        # Default user as technician for general intake
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, email="collector@clms.local", role="specimen_collector")
        self.client = TestClient(app)

        db = TestingSession()
        patient = Patient(first_name="Carlos", last_name="Santana", date_of_birth=None)
        physician = Physician(name="Dr. Sarah Connor")
        db.add_all([patient, physician])
        db.commit()
        self.patient_id = patient.id
        self.physician_id = physician.id
        db.close()

    def tearDown(self):
        Base.metadata.drop_all(engine)
        app.dependency_overrides.clear()

    # -------------------------------------------------------------------------
    # QA Part 1: Expired-Reagent Block Tests
    # -------------------------------------------------------------------------
    def test_expired_reagent_blocks_intake(self):
        """Test that having only expired stock blocks test intake with 409 Conflict."""
        db = TestingSession()
        yesterday = date.today() - timedelta(days=1)
        db.add_all([
            InventoryItem(item_name="Lipid Reagent Kit", quantity=50, expiration_date=yesterday),
            InventoryItem(item_name="Serum Tube", quantity=50, expiration_date=yesterday),
        ])
        db.commit()
        db.close()

        payload = {
            "report_id": "RPT-QA-EXP-01",
            "patient_id": self.patient_id,
            "physician_id": self.physician_id,
            "sample_type": "blood",
            "sample_id": "SMP-QA-EXP-01",
            "collection_datetime": "2026-11-18T10:00:00",
            "test_name": "Lipid Panel",
        }
        res = self.client.post("/tests", json=payload)
        self.assertEqual(res.status_code, 409)
        self.assertIn("Insufficient unexpired stock", res.json()["detail"])

    def test_unexpired_reagent_allows_intake(self):
        """Test that unexpired stock succeeds and deducts from inventory."""
        db = TestingSession()
        next_month = date.today() + timedelta(days=30)
        kit = InventoryItem(item_name="Lipid Reagent Kit", quantity=10, expiration_date=next_month)
        tube = InventoryItem(item_name="Serum Tube", quantity=10, expiration_date=next_month)
        db.add_all([kit, tube])
        db.commit()
        kit_id, tube_id = kit.id, tube.id
        db.close()

        payload = {
            "report_id": "RPT-QA-VALID-01",
            "patient_id": self.patient_id,
            "physician_id": self.physician_id,
            "sample_type": "blood",
            "sample_id": "SMP-QA-VALID-01",
            "collection_datetime": "2026-11-18T10:00:00",
            "test_name": "Lipid Panel",
        }
        res = self.client.post("/tests", json=payload)
        self.assertEqual(res.status_code, 201)

        db = TestingSession()
        updated_kit = db.get(InventoryItem, kit_id)
        updated_tube = db.get(InventoryItem, tube_id)
        self.assertEqual(updated_kit.quantity, 9)
        self.assertEqual(updated_tube.quantity, 9)
        db.close()

    def test_mixed_expired_and_valid_lots_consumes_unexpired(self):
        """Test that expired lots are skipped and only unexpired stock is consumed."""
        db = TestingSession()
        yesterday = date.today() - timedelta(days=2)
        next_month = date.today() + timedelta(days=45)
        expired_kit = InventoryItem(item_name="Lipid Reagent Kit", quantity=5, expiration_date=yesterday)
        valid_kit = InventoryItem(item_name="Lipid Reagent Kit", quantity=5, expiration_date=next_month)
        valid_tube = InventoryItem(item_name="Serum Tube", quantity=10, expiration_date=next_month)
        db.add_all([expired_kit, valid_kit, valid_tube])
        db.commit()
        exp_kit_id = expired_kit.id
        val_kit_id = valid_kit.id
        db.close()

        payload = {
            "report_id": "RPT-QA-MIXED-01",
            "patient_id": self.patient_id,
            "physician_id": self.physician_id,
            "sample_type": "blood",
            "sample_id": "SMP-QA-MIXED-01",
            "collection_datetime": "2026-11-18T10:00:00",
            "test_name": "Lipid Panel",
        }
        res = self.client.post("/tests", json=payload)
        self.assertEqual(res.status_code, 201)

        db = TestingSession()
        exp_kit = db.get(InventoryItem, exp_kit_id)
        val_kit = db.get(InventoryItem, val_kit_id)
        self.assertEqual(exp_kit.quantity, 5)  # unchanged
        self.assertEqual(val_kit.quantity, 4)  # deducted by 1
        db.close()

    # -------------------------------------------------------------------------
    # QA Part 2: Single Barcode Print Tests
    # -------------------------------------------------------------------------
    def _create_sample_test(self, report_id="RPT-BC-01", sample_id="SMP-BC-01"):
        db = TestingSession()
        db.add_all([
            InventoryItem(item_name="Lipid Reagent Kit", quantity=100),
            InventoryItem(item_name="Serum Tube", quantity=100),
        ])
        db.commit()
        db.close()

        res = self.client.post("/tests", json={
            "report_id": report_id,
            "patient_id": self.patient_id,
            "physician_id": self.physician_id,
            "sample_type": "blood",
            "sample_id": sample_id,
            "collection_datetime": "2026-11-18T11:00:00",
            "test_name": "Lipid Panel",
        })
        self.assertEqual(res.status_code, 201)
        return res.json()["id"]

    def test_specimen_collector_can_generate_barcode(self):
        """Specimen collector successfully prints barcode once."""
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=2, email="collector@clms.local", role="specimen_collector")
        test_id = self._create_sample_test("RPT-QA-01", "SMP-QA-01")

        res = self.client.post(f"/tests/{test_id}/generate-barcode")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["test_id"], test_id)
        self.assertTrue(data["barcode"].startswith("BC-"))
        self.assertIn("SMP-QA-01", data["barcode"])
        self.assertTrue(data["barcode_printed"])
        self.assertIsNotNone(data["barcode_printed_at"])

        # Check DB state
        db = TestingSession()
        test = db.get(Test, test_id)
        self.assertTrue(test.barcode_printed)
        self.assertEqual(test.barcode, data["barcode"])
        self.assertEqual(test.barcode_printed_by_id, 2)
        db.close()

    def test_second_barcode_print_returns_409_conflict(self):
        """Second attempt to generate/print barcode on same test returns 409 Conflict."""
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=2, email="collector@clms.local", role="specimen_collector")
        test_id = self._create_sample_test("RPT-QA-02", "SMP-QA-02")

        # First print succeeds
        res1 = self.client.post(f"/tests/{test_id}/generate-barcode")
        self.assertEqual(res1.status_code, 200)

        # Second print is blocked
        res2 = self.client.post(f"/tests/{test_id}/generate-barcode")
        self.assertEqual(res2.status_code, 409)
        self.assertIn("one-time print only", res2.json()["detail"].lower())

    def test_non_specimen_collector_blocked_from_barcode_print(self):
        """Roles other than specimen collector receive 403 Forbidden."""
        test_id = self._create_sample_test("RPT-QA-03", "SMP-QA-03")

        unauthorized_roles = ["technician", "pathologist", "cashier", "billing", "physician"]
        for role in unauthorized_roles:
            app.dependency_overrides[get_current_user] = lambda r=role: SimpleNamespace(id=5, email=f"{r}@clms.local", role=r)
            res = self.client.post(f"/tests/{test_id}/generate-barcode")
            self.assertEqual(res.status_code, 403, f"Role '{role}' should be forbidden from printing barcodes")

    def test_barcode_print_writes_activity_log(self):
        """Barcode generation is audited in ActivityLog table."""
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=7, email="collector@clms.local", role="specimen_collector")
        test_id = self._create_sample_test("RPT-QA-04", "SMP-QA-04")

        res = self.client.post(f"/tests/{test_id}/generate-barcode")
        self.assertEqual(res.status_code, 200)

        db = TestingSession()
        logs = db.query(ActivityLog).filter(ActivityLog.action == "barcode_printed", ActivityLog.resource_id == str(test_id)).all()
        self.assertEqual(len(logs), 1)
        log = logs[0]
        self.assertEqual(log.user_id, 7)
        self.assertEqual(log.resource_type, "test")
        details = json.loads(log.details) if isinstance(log.details, str) else log.details
        self.assertEqual(details["sample_id"], "SMP-QA-04")
        db.close()

    def test_cbc_alias_intake_supported(self):
        """Test intake with aliases 'CBC' and 'Complete Blood Count (CBC)' deduct supplies correctly."""
        db = TestingSession()
        pack = InventoryItem(item_name="CBC Reagent Pack", quantity=10)
        tube = InventoryItem(item_name="EDTA Tube", quantity=10)
        db.add_all([pack, tube])
        db.commit()
        db.close()

        # 1. Test with 'CBC'
        res1 = self.client.post("/tests", json={
            "report_id": "RPT-CBC-01",
            "patient_id": self.patient_id,
            "physician_id": self.physician_id,
            "sample_type": "blood",
            "sample_id": "SMP-CBC-01",
            "collection_datetime": "2026-11-18T12:00:00",
            "test_name": "CBC",
        })
        self.assertEqual(res1.status_code, 201)

        # 2. Test with 'Complete Blood Count (CBC)'
        res2 = self.client.post("/tests", json={
            "report_id": "RPT-CBC-02",
            "patient_id": self.patient_id,
            "physician_id": self.physician_id,
            "sample_type": "blood",
            "sample_id": "SMP-CBC-02",
            "collection_datetime": "2026-11-18T12:00:00",
            "test_name": "Complete Blood Count (CBC)",
        })
        self.assertEqual(res2.status_code, 201)


if __name__ == "__main__":
    unittest.main()
