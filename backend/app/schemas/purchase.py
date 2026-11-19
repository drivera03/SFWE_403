"""Schemas for point-of-sale purchases and generated receipts (SXFT5-215)."""
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class PurchaseItem(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    amount: float = Field(ge=0.0)
    test_id: int | None = None


class PurchaseCreate(BaseModel):
    patient_id: int | None = None
    payment_method: str = Field(min_length=1, max_length=50)  # e.g. "cash", "credit_card", "insurance"
    items: list[PurchaseItem] = Field(min_length=1)
    total: float | None = None
    notes: str | None = None


class ReceiptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    receipt_number: str
    patient_id: int | None = None
    patient_name: str | None = None
    cashier_id: int
    cashier_name: str | None = None
    total: float
    payment_method: str
    status: str
    items: list[dict]
    notes: str | None = None
    created_at: datetime
    formatted_receipt: str
