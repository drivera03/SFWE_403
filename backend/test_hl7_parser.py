"""Unit Tests for HL7-lite Parser and Matching/Merge Logic (SXFT5-184, SXFT5-189)."""
import os
os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-hl7-testing-32charsmin")

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
from app.hl7_parser import parse_hl7_lite
from app.models.activity_log import ActivityLog
from app.models.inventory import InventoryItem
from app.models.patient import Patient
from app.models.tests import Physician, ResultStatus, Test

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


class TestHL7ParserAndMatcher(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, email="tech@clms.local", role="technician")
        self.client = TestClient(app)

        db = TestingSession()
        patient = Patient(first_name="Jane", last_name="Doe")
        physician = Physician(name="Dr. Gregory House")
        db.add_all([
            patient,
            physician,
            InventoryItem(item_name="Lipid Reagent Kit", quantity=50),
            InventoryItem(item_name="Serum Tube", quantity=50),
            InventoryItem(item_name="CBC Reagent Pack", quantity=50),
            InventoryItem(item_name="EDTA Tube", quantity=50),
        ])
        db.commit()
        self.patient_id = patient.id
        self.physician_id = physician.id
        db.close()

    def tearDown(self):
        Base.metadata.drop_all(engine)
        app.dependency_overrides.clear()

    # -------------------------------------------------------------------------
    # SXFT5-184: Parser Unit Tests
    # -------------------------------------------------------------------------
    def test_parse_barcode_pipe_lines(self):
        content = """
        # Analyzer Run 2026-11-18
        BARCODE|BC-SMP-1001|Complete Blood Count|14.5|g/dL|completed|Normal count
        BARCODE|BC-SMP-1002|Lipid Panel|192.4|mg/dL|completed|Desirable
        """
        records = parse_hl7_lite(content)
        self.assertEqual(len(records), 2)

        self.assertEqual(records[0].barcode, "BC-SMP-1001")
        self.assertEqual(records[0].test_name, "Complete Blood Count")
        self.assertEqual(records[0].result_numeric, 14.5)
        self.assertEqual(records[0].units, "g/dL")
        self.assertEqual(records[0].status, "completed")
        self.assertEqual(records[0].notes, "Normal count")

        self.assertEqual(records[1].barcode, "BC-SMP-1002")
        self.assertEqual(records[1].result_numeric, 192.4)
        self.assertEqual(records[1].units, "mg/dL")

    def test_parse_hl7_segment_messages(self):
        content = """
        MSH|^~\\&|SYSMEX|LAB|CLMS|CLMS|20261118230000||ORU^R01|MSG001|P|2.3
        PID|1||PAT-999||DOE^JANE
        OBR|1||BC-SMP-2001|CBC^Complete Blood Count
        OBX|1|NM|WBC||6.8|10^3/uL|4.5-11.0|N|||F
        """
        records = parse_hl7_lite(content)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0].barcode, "BC-SMP-2001")
        self.assertEqual(records[0].result_numeric, 6.8)
        self.assertEqual(records[0].units, "10^3/uL")
        self.assertEqual(records[0].status, "completed")

    def test_parse_endpoint(self):
        payload = {
            "raw_content": "BARCODE|BC-001|Lipid Panel|180|mg/dL|completed|OK"
        }
        res = self.client.post("/tests/hl7/parse", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["record_count"], 1)
        self.assertEqual(data["records"][0]["barcode"], "BC-001")
        self.assertEqual(data["records"][0]["result_numeric"], 180.0)

    # -------------------------------------------------------------------------
    # SXFT5-189: Matching & Merge Logic Tests
    # -------------------------------------------------------------------------
    def test_merge_matches_and_updates_test(self):
        # 1. Create a pending test order
        intake_res = self.client.post("/tests", json={
            "report_id": "RPT-HL7-01",
            "patient_id": self.patient_id,
            "physician_id": self.physician_id,
            "sample_type": "blood",
            "sample_id": "SMP-HL7-01",
            "collection_datetime": "2026-11-18T10:00:00",
            "test_name": "Complete Blood Count",
        })
        self.assertEqual(intake_res.status_code, 201)
        test_id = intake_res.json()["id"]

        # Assign barcode
        db = TestingSession()
        t = db.get(Test, test_id)
        t.barcode = "BC-SMP-HL7-01"
        db.commit()
        db.close()

        # 2. Analyzer outputs result file for BC-SMP-HL7-01
        hl7_text = "BARCODE|BC-SMP-HL7-01|Complete Blood Count|15.2|g/dL|completed|Automated analyzer run"
        merge_res = self.client.post("/tests/hl7/import", json={"raw_content": hl7_text})
        self.assertEqual(merge_res.status_code, 200)
        summary = merge_res.json()
        self.assertEqual(summary["total_records"], 1)
        self.assertEqual(summary["merged_count"], 1)
        self.assertEqual(summary["duplicate_count"], 0)
        self.assertEqual(summary["unmatched_count"], 0)

        # 3. Verify test in DB is now COMPLETED with result values
        db = TestingSession()
        updated_test = db.get(Test, test_id)
        self.assertEqual(updated_test.status, ResultStatus.COMPLETED)
        self.assertEqual(float(updated_test.result_numeric), 15.2)
        self.assertEqual(updated_test.units, "g/dL")
        self.assertIsNotNone(updated_test.results_received_datetime)
        self.assertEqual(updated_test.performed_by_id, 1)

        # 4. Verify audit log entry
        logs = db.query(ActivityLog).filter(ActivityLog.action == "result_entered", ActivityLog.resource_id == str(test_id)).all()
        self.assertEqual(len(logs), 1)
        details = json.loads(logs[0].details) if isinstance(logs[0].details, str) else logs[0].details
        self.assertEqual(details["source"], "hl7_analyzer")
        self.assertEqual(details["barcode"], "BC-SMP-HL7-01")
        db.close()

    def test_merge_matches_by_sample_id_fallback(self):
        """If test.barcode is not set, matching falls back to sample_id."""
        intake_res = self.client.post("/tests", json={
            "report_id": "RPT-HL7-02",
            "patient_id": self.patient_id,
            "physician_id": self.physician_id,
            "sample_type": "blood",
            "sample_id": "SMP-FALLBACK-02",
            "collection_datetime": "2026-11-18T10:00:00",
            "test_name": "Lipid Panel",
        })
        self.assertEqual(intake_res.status_code, 201)
        test_id = intake_res.json()["id"]

        # Barcode sends BC-SMP-FALLBACK-02
        hl7_text = "BARCODE|BC-SMP-FALLBACK-02|Lipid Panel|175.0|mg/dL|completed|Good"
        merge_res = self.client.post("/tests/hl7/import", json={"raw_content": hl7_text})
        self.assertEqual(merge_res.status_code, 200)
        summary = merge_res.json()
        self.assertEqual(summary["merged_count"], 1)

        db = TestingSession()
        updated_test = db.get(Test, test_id)
        self.assertEqual(updated_test.status, ResultStatus.COMPLETED)
        self.assertEqual(float(updated_test.result_numeric), 175.0)
        db.close()

    def test_merge_handles_duplicates(self):
        """A test that is already completed is marked as duplicate and not re-overwritten."""
        intake_res = self.client.post("/tests", json={
            "report_id": "RPT-HL7-03",
            "patient_id": self.patient_id,
            "physician_id": self.physician_id,
            "sample_type": "blood",
            "sample_id": "SMP-DUP-03",
            "collection_datetime": "2026-11-18T10:00:00",
            "test_name": "Lipid Panel",
        })
        test_id = intake_res.json()["id"]

        # First import
        hl7_text1 = "BARCODE|SMP-DUP-03|Lipid Panel|180|mg/dL|completed|Initial"
        res1 = self.client.post("/tests/hl7/import", json={"raw_content": hl7_text1})
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(res1.json()["merged_count"], 1)

        # Second import with same barcode
        hl7_text2 = "BARCODE|SMP-DUP-03|Lipid Panel|250|mg/dL|completed|Duplicate run"
        res2 = self.client.post("/tests/hl7/import", json={"raw_content": hl7_text2})
        self.assertEqual(res2.status_code, 200)
        summary2 = res2.json()
        self.assertEqual(summary2["merged_count"], 0)
        self.assertEqual(summary2["duplicate_count"], 1)
        self.assertIn("already has completed result", summary2["results"][0]["message"])

        # Check DB remains original value
        db = TestingSession()
        test = db.get(Test, test_id)
        self.assertEqual(float(test.result_numeric), 180.0)
        db.close()

    def test_merge_batch_with_unmatched_and_merged(self):
        """Batch containing both existing and unknown barcodes reports accurately."""
        self.client.post("/tests", json={
            "report_id": "RPT-HL7-04",
            "patient_id": self.patient_id,
            "physician_id": self.physician_id,
            "sample_type": "blood",
            "sample_id": "SMP-EXISTS-04",
            "collection_datetime": "2026-11-18T10:00:00",
            "test_name": "Complete Blood Count",
        })

        batch_text = """
        BARCODE|SMP-EXISTS-04|Complete Blood Count|13.8|g/dL|completed
        BARCODE|SMP-UNKNOWN-99|Urinalysis|7.0|pH|completed
        """
        res = self.client.post("/tests/hl7/import", json={"raw_content": batch_text})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["merged_count"], 1)
        self.assertEqual(data["unmatched_count"], 1)


if __name__ == "__main__":
    unittest.main()
