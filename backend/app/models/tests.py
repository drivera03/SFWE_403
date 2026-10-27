import enum
from datetime import date, datetime
from decimal import Decimal

from app.models.user import User
from app.models.patient import Patient
from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def enum_values(enum_cls):
    return [member.value for member in enum_cls]


class SampleType(str, enum.Enum):
    BLOOD = "blood"
    URINE = "urine"
    TISSUE = "tissue"
    OTHER = "other"


class ResultStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    VALIDATED = "validated"


class Physician(Base):
    __tablename__ = "physicians"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))

    tests: Mapped[list["Test"]] = relationship(back_populates="physician")


class Instrument(Base):
    __tablename__ = "instruments"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)


class Test(Base):
    __tablename__ = "tests"
    __table_args__ = (
        CheckConstraint(
            "reference_range_low IS NULL OR reference_range_high IS NULL "
            "OR reference_range_low <= reference_range_high",
            name="ck_tests_reference_range_order",
        ),
        CheckConstraint(
            "result_numeric IS NOT NULL OR result_text IS NOT NULL "
            "OR status = 'pending'",
            name="ck_tests_result_present_unless_pending",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    # Report information
    report_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    report_datetime: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Patient and ordering physician
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    physician_id: Mapped[int] = mapped_column(ForeignKey("physicians.id"), index=True)

    # Test execution details
    sample_type: Mapped[SampleType] = mapped_column(
        Enum(SampleType, name="sample_type", values_callable=enum_values)
    )
    sample_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    collection_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    collected_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    performed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    instrument_id: Mapped[int | None] = mapped_column(ForeignKey("instruments.id"))

    # Test results
    test_name: Mapped[str] = mapped_column(String(200), index=True)
    result_numeric: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    result_text: Mapped[str | None] = mapped_column(String(200))
    units: Mapped[str | None] = mapped_column(String(50))
    reference_range_low: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    reference_range_high: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    reference_range_text: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[ResultStatus] = mapped_column(
        Enum(ResultStatus, name="result_status", values_callable=enum_values),
        default=ResultStatus.PENDING,
    )
    results_received_datetime: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    # Health insurance and billing
    insurance_provider: Mapped[str | None] = mapped_column(String(200))
    insurance_policy_number: Mapped[str | None] = mapped_column(String(100))

    notes: Mapped[str | None] = mapped_column(Text)

    patient: Mapped["Patient"] = relationship()
    physician: Mapped[Physician] = relationship(back_populates="tests")
    instrument: Mapped[Instrument | None] = relationship()
    collected_by: Mapped["User"] = relationship(foreign_keys=[collected_by_id])
    performed_by: Mapped["User | None"] = relationship(foreign_keys=[performed_by_id])