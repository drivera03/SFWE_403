from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.activity_logger import log_activity
from app.database import get_db
from app.dependencies import LAB_STAFF_ROLES, require_role
from app.models.patient import Patient
from app.models.tests import Instrument, Physician, ResultStatus, Test
from app.models.user import User
from app.schemas.test import (
    InstrumentResponse,
    PhysicianCreate,
    PhysicianResponse,
    TestCreate,
    TestResponse,
    TestUpdate,
)

# ConOps 6.3.1, 6.3.2, 6.3.5: all laboratory personnel may enter tests and view
# test tracking. External users (patients, physicians) are not allowed.
router = APIRouter(
    prefix="/tests",
    tags=["tests"],
    dependencies=[Depends(require_role(*LAB_STAFF_ROLES))],
)


def not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def load_test(db: Session, test_id: int) -> Test | None:
    """Fetch one test with its physician and instrument loaded."""
    return (
        db.query(Test)
        .options(selectinload(Test.physician), selectinload(Test.instrument))
        .filter(Test.id == test_id)
        .first()
    )


@router.post("", response_model=TestResponse, status_code=status.HTTP_201_CREATED)
def create_test(
    body: TestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*LAB_STAFF_ROLES)),
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

    log_activity(
        db=db,
        action="test_created",
        user_id=current_user.id,
        resource_type="test",
        resource_id=str(test.id),
        details={"test_name": test.test_name, "patient_id": test.patient_id},
    )
    return test


@router.get("", response_model=list[TestResponse])
def list_tests_for_patient(patient_id: int = Query(...), db: Session = Depends(get_db)):
    """List all tests for one patient, newest collection first."""
    if db.get(Patient, patient_id) is None:
        raise not_found(f"Patient with ID {patient_id} not found")

    return (
        db.query(Test)
        .options(selectinload(Test.physician), selectinload(Test.instrument))
        .filter(Test.patient_id == patient_id)
        .order_by(Test.collection_datetime.desc(), Test.id.desc())
        .all()
    )


@router.get("/physicians", response_model=list[PhysicianResponse])
def list_physicians(db: Session = Depends(get_db)):
    """List all registered physicians for test ordering."""
    return db.query(Physician).order_by(Physician.name).all()


@router.post("/physicians", response_model=PhysicianResponse, status_code=status.HTTP_201_CREATED)
def create_physician(body: PhysicianCreate, db: Session = Depends(get_db)):
    """Quickly register an ordering physician if not yet present."""
    existing = db.query(Physician).filter(Physician.name == body.name).first()
    if existing:
        return existing
    physician = Physician(name=body.name)
    db.add(physician)
    db.commit()
    db.refresh(physician)
    return physician


@router.get("/instruments", response_model=list[InstrumentResponse])
def list_instruments(db: Session = Depends(get_db)):
    """List all registered lab instruments and analyzers."""
    return db.query(Instrument).order_by(Instrument.name).all()


@router.get("/{test_id}", response_model=TestResponse)
def get_test(test_id: int, db: Session = Depends(get_db)):
    """Get one test by ID."""
    test = load_test(db, test_id)
    if test is None:
        raise not_found(f"Test with ID {test_id} not found")
    return test


@router.put("/{test_id}", response_model=TestResponse)
def update_test(
    test_id: int,
    body: TestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*LAB_STAFF_ROLES)),
):
    """Update a test: rename it, change its status, or record results/notes."""
    test = load_test(db, test_id)
    if test is None:
        raise not_found(f"Test with ID {test_id} not found")

    changes = body.model_dump(exclude_unset=True)
    # test_name and status are required columns, so an explicit null means "leave it alone"
    for required in ("test_name", "status"):
        if changes.get(required) is None:
            changes.pop(required, None)

    for field, value in changes.items():
        setattr(test, field, value)

    # The DB only allows a non-pending status once a result exists; give a clear error instead of a 500.
    if test.status != ResultStatus.PENDING and test.result_numeric is None and test.result_text is None:
        requested_status = test.status.value  # read before rollback resets the object
        db.rollback()
        raise HTTPException(
            status_code=422,
            detail=f"A result (numeric or text) is required to set status to '{requested_status}'",
        )

    if ("result_numeric" in changes or "result_text" in changes) and test.results_received_datetime is None:
        test.results_received_datetime = datetime.now(timezone.utc)
        test.performed_by_id = current_user.id

    db.commit()
    db.refresh(test)

    log_activity(
        db=db,
        action="test_updated",
        user_id=current_user.id,
        resource_type="test",
        resource_id=str(test.id),
        details={"updated_fields": list(changes.keys())},
    )
    return test


@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_test(
    test_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*LAB_STAFF_ROLES)),
):
    """Delete a test."""
    test = db.get(Test, test_id)
    if test is None:
        raise not_found(f"Test with ID {test_id} not found")

    test_name, patient_id = test.test_name, test.patient_id
    db.delete(test)
    db.commit()

    log_activity(
        db=db,
        action="test_deleted",
        user_id=current_user.id,
        resource_type="test",
        resource_id=str(test_id),
        details={"test_name": test_name, "patient_id": patient_id},
    )
    return None
