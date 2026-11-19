from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.tests import ResultStatus, SampleType


class TestCreate(BaseModel):
    """Body for POST /tests (test intake). Results are added later, so status always starts as pending."""

    report_id: str = Field(min_length=1, max_length=50)
    patient_id: int
    physician_id: int
    sample_type: SampleType
    sample_id: str = Field(min_length=1, max_length=50)
    collection_datetime: datetime
    test_name: str = Field(min_length=1, max_length=200)
    instrument_id: int | None = None
    units: str | None = Field(default=None, max_length=50)
    reference_range_low: float | None = None
    reference_range_high: float | None = None
    reference_range_text: str | None = Field(default=None, max_length=200)
    insurance_provider: str | None = Field(default=None, max_length=200)
    insurance_policy_number: str | None = Field(default=None, max_length=100)
    notes: str | None = None


class PhysicianResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class PhysicianCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class InstrumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class TestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    report_id: str
    report_datetime: datetime | None = None
    patient_id: int
    physician_id: int
    sample_type: SampleType
    sample_id: str
    barcode: str | None = None
    barcode_printed: bool = False
    barcode_printed_at: datetime | None = None
    collection_datetime: datetime
    collected_by_id: int
    performed_by_id: int | None = None
    instrument_id: int | None = None
    test_name: str
    result_numeric: float | None = None
    result_text: str | None = None
    units: str | None = None
    reference_range_low: float | None = None
    reference_range_high: float | None = None
    reference_range_text: str | None = None
    status: ResultStatus
    results_received_datetime: datetime | None = None
    insurance_provider: str | None = None
    insurance_policy_number: str | None = None
    notes: str | None = None
    physician: PhysicianResponse | None = None
    instrument: InstrumentResponse | None = None


class BarcodeResponse(BaseModel):
    test_id: int
    barcode: str
    sample_id: str
    sample_type: str
    test_name: str
    patient_id: int
    report_id: str
    barcode_printed: bool
    barcode_printed_at: str | None = None
    message: str


class HL7ImportRequest(BaseModel):
    raw_content: str


class TestUpdate(BaseModel):
    """Body for PUT /tests/{id}. Only the fields that are sent get changed."""

    test_name: str | None = Field(default=None, min_length=1, max_length=200)
    status: ResultStatus | None = None
    result_numeric: float | None = None
    result_text: str | None = Field(default=None, max_length=200)
    notes: str | None = None
