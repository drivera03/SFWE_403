from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.patient import Patient
from app.models.tests import Instrument, Physician, ResultStatus, Test
from app.models.user import User
from app.schemas.test import TestCreate, TestResponse

# Every test route requires a logged-in user.
router = APIRouter(
    prefix="/tests",
    tags=["tests"],
    dependencies=[Depends(get_current_user)],
)


def not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


@router.post("", response_model=TestResponse, status_code=status.HTTP_201_CREATED)
def create_test(
    body: TestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new test order (intake). The logged-in user is recorded as the collector."""
    if db.get(Patient, body.patient_id) is None:
        raise not_found(f"Patient with ID {body.patient_id} not found")
    if db.get(Physician, body.physician_id) is None:
        raise not_found(f"Physician with ID {body.physician_id} not found")
    if body.instrument_id is not None and db.get(Instrument, body.instrument_id) is None:
        raise not_found(f"Instrument with ID {body.instrument_id} not found")

    if db.query(Test).filter(Test.report_id == body.report_id).first():
        raise HTTPException(status.HTTP_409_CONFLICT, f"Report ID {body.report_id} already exists")
    if db.query(Test).filter(Test.sample_id == body.sample_id).first():
        raise HTTPException(status.HTTP_409_CONFLICT, f"Sample ID {body.sample_id} already exists")

    test = Test(
        **body.model_dump(),
        collected_by_id=current_user.id,
        status=ResultStatus.PENDING,
    )
    db.add(test)
    db.commit()
    db.refresh(test)
    return test


@router.get("", response_model=list[TestResponse])
def list_tests_for_patient(patient_id: int = Query(...), db: Session = Depends(get_db)):
    """List all tests for one patient, newest collection first."""
    if db.get(Patient, patient_id) is None:
        raise not_found(f"Patient with ID {patient_id} not found")

    return (
        db.query(Test)
        .filter(Test.patient_id == patient_id)
        .order_by(Test.collection_datetime.desc(), Test.id.desc())
        .all()
    )


@router.get("/{test_id}", response_model=TestResponse)
def get_test(test_id: int, db: Session = Depends(get_db)):
    """Get one test by ID."""
    test = db.get(Test, test_id)
    if test is None:
        raise not_found(f"Test with ID {test_id} not found")
    return test