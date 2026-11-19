"""Point-of-sale purchase and billing receipt model (ConOps 6.5.1, 6.6, SXFT5-215)."""
from datetime import datetime, timezone
from decimal import Decimal
import json

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.patient import Patient
from app.models.user import User


class Purchase(Base):
    __tablename__ = "purchases"

    id: Mapped[int] = mapped_column(primary_key=True)
    receipt_number: Mapped[str] = mapped_column(String(50), unique=True, index=True)

    patient_id: Mapped[int | None] = mapped_column(ForeignKey("patients.id"), nullable=True, index=True)
    cashier_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    total: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    payment_method: Mapped[str] = mapped_column(String(50))  # "cash", "credit_card", "debit_card", "insurance"
    status: Mapped[str] = mapped_column(String(50), default="completed")  # "completed", "refunded"

    items_json: Mapped[str] = mapped_column(Text, default="[]")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    patient: Mapped[Patient | None] = relationship()
    cashier: Mapped[User] = relationship(foreign_keys=[cashier_id])

    @property
    def items(self) -> list[dict]:
        try:
            return json.loads(self.items_json) if self.items_json else []
        except Exception:
            return []

    @items.setter
    def items(self, val: list[dict]):
        self.items_json = json.dumps(val)
