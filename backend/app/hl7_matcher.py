"""Matching and merge logic for analyzer results and test records (SXFT5-189).

Handles:
1. Matching incoming analyzer barcodes to Test records (by barcode or sample_id).
2. Updating test status to completed with analyzer values, units, timestamp, and technician.
3. Marking processed and writing audit log entry.
4. Detecting and handling duplicates (existing completed tests or repeat records in same batch).
"""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.activity_logger import log_activity
from app.hl7_parser import HL7ResultRecord
from app.models.tests import ResultStatus, Test


def merge_hl7_results(
    db: Session,
    records: list[HL7ResultRecord],
    current_user_id: int,
) -> dict:
    """Match and merge parsed HL7 analyzer records into Test entities.

    Enforces duplicate checking and records audit logs.
    """
    merged: list[dict] = []
    duplicates: list[dict] = []
    unmatched: list[dict] = []

    seen_barcodes_in_batch: set[str] = set()

    for rec in records:
        barcode_clean = rec.barcode.strip()

        # Batch duplicate check
        if barcode_clean in seen_barcodes_in_batch:
            duplicates.append({
                "barcode": barcode_clean,
                "status": "duplicate",
                "message": f"Barcode '{barcode_clean}' duplicated within the same HL7 batch; subsequent record skipped.",
            })
            continue

        # Find matching test: check barcode, sample_id, or stripped prefix
        query = db.query(Test).filter(
            or_(
                Test.barcode == barcode_clean,
                Test.sample_id == barcode_clean,
                Test.report_id == barcode_clean,
            )
        )
        test = query.first()

        if test is None and barcode_clean.startswith("BC-"):
            stripped = barcode_clean[3:]
            test = db.query(Test).filter(Test.sample_id == stripped).first()

        if test is None:
            unmatched.append({
                "barcode": barcode_clean,
                "status": "unmatched",
                "message": f"No active test order found matching barcode or sample ID '{barcode_clean}'.",
            })
            continue

        # Check existing result duplicate
        is_already_completed = (
            test.status in (ResultStatus.COMPLETED, ResultStatus.VALIDATED)
            and (test.result_numeric is not None or test.result_text is not None)
        )
        if is_already_completed:
            existing_val = test.result_numeric if test.result_numeric is not None else test.result_text
            duplicates.append({
                "barcode": barcode_clean,
                "test_id": test.id,
                "test_name": test.test_name,
                "status": "duplicate",
                "message": f"Test #{test.id} already has completed result ({existing_val}, status '{test.status.value}'). Duplicate skipped.",
            })
            seen_barcodes_in_batch.add(barcode_clean)
            continue

        # Merge results into test record
        if rec.result_numeric is not None:
            test.result_numeric = rec.result_numeric
        if rec.result_text is not None:
            test.result_text = rec.result_text
        if rec.units:
            test.units = rec.units
        if rec.reference_range_text and not test.reference_range_text:
            test.reference_range_text = rec.reference_range_text

        test.status = ResultStatus.COMPLETED
        test.results_received_datetime = datetime.now(timezone.utc)
        test.performed_by_id = current_user_id

        if not test.barcode:
            test.barcode = barcode_clean

        if rec.notes:
            note_str = f"[Analyzer Result]: {rec.notes}"
            test.notes = f"{test.notes}\n{note_str}".strip() if test.notes else note_str

        db.add(test)
        log_activity(
            db=db,
            action="result_entered",
            user_id=current_user_id,
            resource_type="test",
            resource_id=str(test.id),
            details={
                "source": "hl7_analyzer",
                "barcode": barcode_clean,
                "test_name": test.test_name,
                "result_numeric": float(test.result_numeric) if test.result_numeric is not None else None,
                "result_text": test.result_text,
                "units": test.units,
            },
            commit=False,
        )

        seen_barcodes_in_batch.add(barcode_clean)
        merged.append({
            "barcode": barcode_clean,
            "test_id": test.id,
            "test_name": test.test_name,
            "status": "merged",
            "result_numeric": float(test.result_numeric) if test.result_numeric is not None else None,
            "result_text": test.result_text,
            "units": test.units,
        })

    if merged:
        db.commit()

    return {
        "total_records": len(records),
        "merged_count": len(merged),
        "duplicate_count": len(duplicates),
        "unmatched_count": len(unmatched),
        "results": merged + duplicates + unmatched,
    }
