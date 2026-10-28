from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class LabTestCreate(BaseModel):
    test_name: str = Field(..., min_length=1, max_length=100)
    status: str = Field(default="pending", max_length=50)


class LabTestUpdate(BaseModel):
    test_name: str | None = Field(default=None, min_length=1, max_length=100)
    status: str | None = Field(default=None, max_length=50)


class LabTestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int
    test_name: str
    status: str
    created_at: datetime
