"""Create the test-intake tables without changing existing patient or user data.

Run from backend/: python -m app.migrate_tests
"""

from sqlalchemy import inspect

from app.database import Base, engine
from app.models.tests import Instrument, Physician, Test


def migrate_tests(bind):
    with bind.begin() as connection:
        inspector = inspect(connection)
        missing = [name for name in ("patients", "users") if not inspector.has_table(name)]
        if missing:
            raise RuntimeError(
                "Initialize the application database first; missing tables: "
                + ", ".join(missing)
            )

        # Use the application's schema, including enums, indexes and constraints.
        # checkfirst makes this safe for databases already initialized at startup.
        Base.metadata.create_all(
            connection,
            tables=[Physician.__table__, Instrument.__table__, Test.__table__],
            checkfirst=True,
        )

        inspector = inspect(connection)
        patient_column = next(
            column for column in inspector.get_columns("tests")
            if column["name"] == "patient_id"
        )
        patient_fk = any(
            fk["constrained_columns"] == ["patient_id"]
            and fk["referred_table"] == "patients"
            and fk["referred_columns"] == ["id"]
            for fk in inspector.get_foreign_keys("tests")
        )
        if patient_column["nullable"] or not patient_fk:
            raise RuntimeError(
                "Existing tests table does not have the required non-null "
                "patient_id foreign key to patients.id; manual schema repair is required."
            )


if __name__ == "__main__":
    migrate_tests(engine)
    print("Tests migration complete: tests.patient_id references patients.id.")
