from datetime import date

from pydantic import BaseModel, ConfigDict

from app.schemas.test import TestResponse


class InventoryItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_name: str
    batch_number: str | None = None
    lot_number: str | None = None
    quantity: int
    expiration_date: date | None = None
    reorder_threshold: int
    machine_id: int | None = None


class LotLookupResponse(BaseModel):
    items: list[InventoryItemResponse]
    tests: list[TestResponse]


class SupplyCheck(BaseModel):
    item_name: str
    needed: int
    available: int
    ok: bool


class AvailabilityResponse(BaseModel):
    test_name: str
    available: bool
    supplies: list[SupplyCheck]