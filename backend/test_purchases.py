"""QA Unit Tests for End-to-End Purchase and Receipt Generation (SXFT5-215)."""
import os
os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-purchase-testing-32chars")

import json
import unittest
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
from app.models.patient import Patient
from app.models.purchase import Purchase
from app.models.tests import Physician, Test

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


class TestPurchaseAndReceiptQA(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        app.dependency_overrides[get_db] = override_get_db
        # Set default active user as Cashier
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            id=6,
            email="cashier@clms.local",
            username="cashier",
            role="cashier",
        )
        self.client = TestClient(app)

        db = TestingSession()
        patient = Patient(first_name="Miles", last_name="Davis", date_of_birth=None)
        db.add(patient)
        db.commit()
        self.patient_id = patient.id
        db.close()

    def tearDown(self):
        Base.metadata.drop_all(engine)
        app.dependency_overrides.clear()

    def test_complete_purchase_end_to_end_and_generates_receipt(self):
        """QA Ticket SXFT5-215: Complete a purchase end-to-end and confirm the receipt generates."""
        payload = {
            "patient_id": self.patient_id,
            "payment_method": "credit_card",
            "items": [
                {"description": "Lipid Panel Test", "amount": 75.00, "test_id": 101},
                {"description": "Venipuncture Blood Draw", "amount": 25.50, "test_id": None},
            ],
            "notes": "Patient presented insurance co-pay authorization.",
        }

        # 1. Complete point-of-sale purchase
        res = self.client.post("/purchases", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()

        # 2. Confirm receipt identifiers and structure
        purchase_id = data["id"]
        receipt_number = data["receipt_number"]
        self.assertTrue(receipt_number.startswith("RCP-"))
        self.assertEqual(data["total"], 100.50)
        self.assertEqual(data["payment_method"], "credit_card")
        self.assertEqual(data["status"], "completed")
        self.assertEqual(data["patient_name"], "Miles Davis")
        self.assertEqual(len(data["items"]), 2)

        # 3. Confirm human-readable formatted receipt was generated
        receipt_text = data["formatted_receipt"]
        self.assertIn("CLMS CLINICAL LABORATORY RECEIPT", receipt_text)
        self.assertIn(receipt_number, receipt_text)
        self.assertIn("Miles Davis", receipt_text)
        self.assertIn("Lipid Panel Test", receipt_text)
        self.assertIn("Venipuncture Blood Draw", receipt_text)
        self.assertIn("100.50", receipt_text)
        self.assertIn("CREDIT_CARD", receipt_text)

        # 4. Confirm receipt can be retrieved via GET endpoint
        get_res = self.client.get(f"/purchases/{purchase_id}")
        self.assertEqual(get_res.status_code, 200)
        get_data = get_res.json()
        self.assertEqual(get_data["receipt_number"], receipt_number)
        self.assertEqual(get_data["total"], 100.50)

        # 5. Confirm activity log audit was written automatically
        db = TestingSession()
        logs = db.query(ActivityLog).filter(
            ActivityLog.action == "purchase_completed",
            ActivityLog.resource_id == str(purchase_id),
        ).all()
        self.assertEqual(len(logs), 1)
        log = logs[0]
        self.assertEqual(log.user_id, 6)
        self.assertEqual(log.resource_type, "purchase")

        details = json.loads(log.details) if isinstance(log.details, str) else log.details
        self.assertEqual(float(details["total"]), 100.50)
        self.assertEqual(details["payment_method"], "credit_card")
        self.assertEqual(details["patient_id"], self.patient_id)
        self.assertIn(101, details["test_ids"])
        self.assertEqual(details["receipt_number"], receipt_number)
        db.close()

    def test_walk_in_purchase_without_patient(self):
        """Purchase for walk-in self-pay client generates valid receipt."""
        payload = {
            "patient_id": None,
            "payment_method": "cash",
            "items": [
                {"description": "Rapid Strep Test", "amount": 35.00},
            ],
        }
        res = self.client.post("/purchases", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertIsNone(data["patient_id"])
        self.assertIn("Walk-In", data["formatted_receipt"])
        self.assertEqual(data["total"], 35.00)

    def test_unauthorized_role_blocked_from_purchases(self):
        """Technician or pathologist cannot process cashier point-of-sale purchases."""
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            id=9, email="tech@clms.local", username="tech", role="technician"
        )
        payload = {
            "payment_method": "cash",
            "items": [{"description": "Lab Panel", "amount": 50.00}],
        }
        res = self.client.post("/purchases", json=payload)
        self.assertEqual(res.status_code, 403)

    def test_billing_and_manager_roles_authorized(self):
        """Both billing role and lab_manager can process and view purchases."""
        for role_name in ("billing", "lab_manager", "manager"):
            app.dependency_overrides[get_current_user] = lambda r=role_name: SimpleNamespace(
                id=12, email=f"{r}@clms.local", username=r, role=r
            )
            res = self.client.post("/purchases", json={
                "payment_method": "check",
                "items": [{"description": "Test Panel", "amount": 60.00}],
            })
            self.assertEqual(res.status_code, 201, f"Role {role_name} should be authorized")


if __name__ == "__main__":
    unittest.main()
