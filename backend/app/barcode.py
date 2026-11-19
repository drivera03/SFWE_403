"""Barcode generation and formatting logic for laboratory samples (SXFT5-162)."""
import hashlib
import re
from datetime import datetime, timezone


def sanitize_barcode_component(val: str) -> str:
    """Sanitize string to alphanumeric and dashes only for 1D/2D barcode scanners."""
    if not val:
        return "X"
    cleaned = re.sub(r"[^A-Za-z0-9\-]", "", val.strip().upper())
    return cleaned if cleaned else "X"


def generate_sample_barcode(
    sample_id: str,
    sample_type: str = "blood",
    test_id: int | None = None,
) -> str:
    """Generate a unique, scanner-friendly barcode identifier for a lab sample.

    Format: BC-{SAMPLE_ID} or BC-{TEST_ID:05d}-{SAMPLE_ID}
    Guaranteed unique because sample_id is unique per test record.
    Code-128 / Code-39 compatible.
    """
    clean_sample = sanitize_barcode_component(sample_id)
    if clean_sample.startswith("BC-"):
        return clean_sample

    if test_id is not None:
        return f"BC-{test_id:05d}-{clean_sample}"
    return f"BC-{clean_sample}"


def format_barcode_payload(test) -> dict:
    """Format full barcode label payload for printing (SXFT5-162, SXFT5-172)."""
    barcode = test.barcode or generate_sample_barcode(
        test.sample_id,
        test.sample_type.value if hasattr(test.sample_type, "value") else str(test.sample_type),
        test.id,
    )
    return {
        "test_id": test.id,
        "barcode": barcode,
        "sample_id": test.sample_id,
        "sample_type": test.sample_type.value if hasattr(test.sample_type, "value") else str(test.sample_type),
        "test_name": test.test_name,
        "patient_id": test.patient_id,
        "report_id": test.report_id,
        "barcode_printed": bool(test.barcode_printed),
        "barcode_printed_at": (
            test.barcode_printed_at.isoformat() if test.barcode_printed_at else None
        ),
    }
