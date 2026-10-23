from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field, model_validator


class LabTestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    test_name: str
    status: str
    created_at: datetime


class PatientCreate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    date_of_birth: date | None = None
    sex: str | None = Field(default=None, max_length=20)
    name: str | None = None
    dob: str | None = None
    phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=255)
    insurance_provider: str | None = Field(default=None, max_length=100)
    policy_number: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def check_fields(self):
        if self.first_name is not None:
            if not self.last_name or not self.date_of_birth:
                raise ValueError("last_name and date_of_birth are required when first_name is provided")
        elif not self.name:
            raise ValueError("first_name or name must be provided")

        if not self.name and (self.first_name or self.last_name):
            self.name = f"{self.first_name or ''} {self.last_name or ''}".strip()
        elif self.name and not self.first_name:
            parts = self.name.split()
            self.first_name = parts[0] if parts else ""
            if not self.last_name and len(parts) > 1:
                self.last_name = " ".join(parts[1:])

        if not self.dob and self.date_of_birth:
            self.dob = str(self.date_of_birth)
        elif self.dob and not self.date_of_birth:
            try:
                self.date_of_birth = datetime.strptime(self.dob, "%Y-%m-%d").date()
            except Exception:
                pass
        return self


class PatientUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    date_of_birth: date | None = None
    sex: str | None = None
    name: str | None = None
    dob: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    insurance_provider: str | None = None
    policy_number: str | None = None


class PatientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    first_name: str | None = None
    last_name: str | None = None
    date_of_birth: date | None = None
    sex: str | None = None
    name: str | None = None
    dob: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    insurance_provider: str | None = None
    policy_number: str | None = None
    created_at: datetime
    updated_at: datetime
    tests: list[LabTestResponse] = []

    @model_validator(mode="after")
    def fill_computed(self):
        if not self.name and (self.first_name or self.last_name):
            self.name = f"{self.first_name or ''} {self.last_name or ''}".strip()
        elif self.name and not self.first_name:
            parts = self.name.split()
            self.first_name = parts[0] if parts else ""
            if not self.last_name and len(parts) > 1:
                self.last_name = " ".join(parts[1:])
        if not self.dob and self.date_of_birth:
            self.dob = str(self.date_of_birth)
        elif self.dob and not self.date_of_birth:
            try:
                self.date_of_birth = datetime.strptime(self.dob, "%Y-%m-%d").date()
            except Exception:
                pass
        return self
