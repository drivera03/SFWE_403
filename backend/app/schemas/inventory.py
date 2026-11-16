from datetime import date

from pydantic import BaseModel, ConfigDict, Field

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


class InventoryReceiveRequest(BaseModel):
    item_id: int | None = None
    item_name: str = Field(min_length=1, max_length=200)
    quantity: int = Field(gt=0, description="Quantity of supplies received")
    batch_number: str | None = Field(default=None, max_length=100)
    lot_number: str | None = Field(default=None, max_length=100)
    expiration_date: date | None = None
    reorder_threshold: int | None = Field(default=None, ge=0)
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