from datetime import date, datetime, timezone
from typing import List

from sqlalchemy import String, Date, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), index=True, nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    sex: Mapped[str | None] = mapped_column(String(20), nullable=True)

    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dob: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    insurance_provider: Mapped[str | None] = mapped_column(String(100), nullable=True)
    policy_number: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tests: Mapped[List["LabTest"]] = relationship("LabTest", back_populates="patient")

    def __init__(self, **kwargs):
        # Auto-sync name <-> first_name/last_name and dob <-> date_of_birth
        first_name = kwargs.get("first_name")
        last_name = kwargs.get("last_name")
        name = kwargs.get("name")
        date_of_birth = kwargs.get("date_of_birth")
        dob = kwargs.get("dob")

        if (first_name or last_name) and not name:
            kwargs["name"] = f"{first_name or ''} {last_name or ''}".strip()
        elif name and not first_name:
            parts = name.split()
            kwargs["first_name"] = parts[0] if parts else ""
            kwargs["last_name"] = " ".join(parts[1:]) if len(parts) > 1 else ""

        if date_of_birth and not dob:
            kwargs["dob"] = str(date_of_birth)
        elif dob and not date_of_birth:
            try:
                kwargs["date_of_birth"] = datetime.strptime(dob, "%Y-%m-%d").date()
            except Exception:
                pass

        super().__init__(**kwargs)
