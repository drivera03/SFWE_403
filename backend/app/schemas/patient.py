from datetime import datetime
from pydantic import BaseModel, ConfigDict


class LabTestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    test_name: str
    status: str
    created_at: datetime


class PatientBase(BaseModel):
    name: str
    dob: str
    address: str
    phone: str
    email: str
    insurance_provider: str
    policy_number: str


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    name: str | None = None
    dob: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    insurance_provider: str | None = None
    policy_number: str | None = None


class PatientResponse(PatientBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    tests: list[LabTestResponse] = []
