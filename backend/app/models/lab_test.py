from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class LabTest(Base):
    __tablename__ = "lab_tests"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(Integer, ForeignKey("patients.id"), nullable=False)
    test_name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    # Relationships
    patient: Mapped["Patient"] = relationship("Patient", back_populates="tests")
