"""Fold the old `lab_tests` table into `tests`, then drop `lab_tests`.

Run once from backend/:  python -m app.migrate_merge_lab_tests

`lab_tests` only stored (patient, test name, status, created time), while `tests`
requires more fields, so migrated rows get clearly-marked placeholders:
  - report_id / sample_id   -> LEGACY-RPT-<old id> / LEGACY-SMP-<old id>
  - sample_type             -> other
  - physician               -> a physician named "Unassigned (migrated)"
  - collected_by            -> the first user in the users table
  - collection_datetime     -> the old created_at
Statuses: pending stays pending. in_progress and cancelled become pending, and
completed stays completed with a placeholder result (the old table had none).
The original status is appended to the notes for anything that was not pending.

It is safe to re-run: rows already migrated are skipped, and `lab_tests` is only
dropped after every row has been copied.
"""

from datetime import datetime, timezone

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.database import Base, engine
from app.models.tests import Instrument, Physician, ResultStatus, SampleType, Test
from app.models.user import User

PLACEHOLDER_PHYSICIAN = "Unassigned (migrated)"


def _as_datetime(value) -> datetime:
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    if value is None:
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value


def migrate_lab_tests(bind) -> int:
    """Copy every lab_tests row into tests and drop lab_tests. Returns rows copied."""
    if not inspect(bind).has_table("lab_tests"):
        print("No lab_tests table found; nothing to do.")
        return 0

    # Make sure the target tables exist.
    Base.metadata.create_all(
        bind,
        tables=[Physician.__table__, Instrument.__table__, Test.__table__],
        checkfirst=True,
    )

    with bind.connect() as conn:
        old_rows = conn.execute(
            text("SELECT id, patient_id, test_name, status, created_at FROM lab_tests ORDER BY id")
        ).mappings().all()

    copied = 0
    with Session(bind) as db:
        if old_rows:
            collector = db.query(User).order_by(User.id).first()
            if collector is None:
                raise RuntimeError("No users exist, so migrated tests have no one to record as collector.")
            physician = db.query(Physician).filter(Physician.name == PLACEHOLDER_PHYSICIAN).first()
            if physician is None:
                physician = Physician(name=PLACEHOLDER_PHYSICIAN)
                db.add(physician)
                db.flush()

        for row in old_rows:
            report_id = f"LEGACY-RPT-{row['id']}"
            if db.query(Test).filter(Test.report_id == report_id).first():
                continue

            old_status = (row["status"] or "pending").lower()
            created = _as_datetime(row["created_at"])
            test = Test(
                report_id=report_id,
                sample_id=f"LEGACY-SMP-{row['id']}",
                patient_id=row["patient_id"],
                physician_id=physician.id,
                sample_type=SampleType.OTHER,
                collection_datetime=created,
                collected_by_id=collector.id,
                test_name=row["test_name"],
                status=ResultStatus.PENDING,
            )
            if old_status == "completed":
                test.status = ResultStatus.COMPLETED
                test.result_text = "Legacy record: no result stored"
                test.results_received_datetime = created
            if old_status != "pending":
                test.notes = f"Migrated from lab_tests (original status: {old_status})"
            db.add(test)
            copied += 1

        db.commit()

        # Every old row is now represented in tests; verify before dropping.
        for row in old_rows:
            if not db.query(Test).filter(Test.report_id == f"LEGACY-RPT-{row['id']}").first():
                raise RuntimeError(f"lab_tests row {row['id']} was not migrated; leaving lab_tests in place.")

    with bind.begin() as conn:
        conn.execute(text("DROP TABLE lab_tests"))

    print(f"Migrated {copied} row(s) from lab_tests into tests and dropped lab_tests.")
    return copied


if __name__ == "__main__":
    migrate_lab_tests(engine)
