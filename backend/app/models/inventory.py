from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.tests import Instrument


class InventoryItem(Base):
    __tablename__ = "inventory"
    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_inventory_quantity_nonnegative"),
        CheckConstraint("reorder_threshold >= 0", name="ck_inventory_reorder_nonnegative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    item_name: Mapped[str] = mapped_column(String(200), index=True)
    batch_number: Mapped[str | None] = mapped_column(String(100), index=True)
    lot_number: Mapped[str | None] = mapped_column(String(100), index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    expiration_date: Mapped[date | None] = mapped_column(Date, index=True)
    reorder_threshold: Mapped[int] = mapped_column(Integer, default=0)
    # The instrument (machine) this item is used on, if any
    machine_id: Mapped[int | None] = mapped_column(ForeignKey("instruments.id"), index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    machine: Mapped[Instrument | None] = relationship()