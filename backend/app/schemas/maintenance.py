from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.test import InstrumentResponse


class MaintenanceLogCreate(BaseModel):
    instrument_id: int
    maintenance_type: str = Field(min_length=1, max_length=100)
    maintenance_date: datetime | None = None
    performed_by_name: str | None = Field(default=None, max_length=200)
    status: str = Field(default="Completed", max_length=50)
    notes: str | None = None
    next_due_date: date | None = None


class MaintenanceLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    instrument_id: int
    maintenance_type: str
    maintenance_date: datetime
    performed_by_id: int | None = None
    performed_by_name: str | None = None
    status: str
    notes: str | None = None
    next_due_date: date | None = None
    created_at: datetime | None = None
    instrument: InstrumentResponse | None = None
