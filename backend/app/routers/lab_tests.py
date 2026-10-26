import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.patient import Patient
from app.models.lab_test import LabTest
from app.schemas.lab_test import LabTestCreate, LabTestUpdate, LabTestResponse
from app.activity_logger import log_activity

logger = logging.getLogger("uvicorn.error")

router = APIRouter(
    prefix="/patients/{patient_id}/tests",
    tags=["lab-tests"],
    dependencies=[Depends(get_current_user)],
)


def get_patient_or_404(patient_id: int, db: Session) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID {patient_id} not found",
        )
    return patient


def get_test_or_404(patient_id: int, test_id: int, db: Session) -> LabTest:
    test = (
        db.query(LabTest)
        .filter(LabTest.id == test_id, LabTest.patient_id == patient_id)
        .first()
    )
    if test is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lab test with ID {test_id} not found for patient {patient_id}",
        )
    return test


@router.get("", response_model=List[LabTestResponse])
def list_tests(patient_id: int, db: Session = Depends(get_db)):
    """List all lab tests for a specific patient."""
    get_patient_or_404(patient_id, db)
    return (
        db.query(LabTest)
        .filter(LabTest.patient_id == patient_id)
        .order_by(LabTest.created_at.desc())
        .all()
    )


@router.post("", response_model=LabTestResponse, status_code=status.HTTP_201_CREATED)
def create_test(
    patient_id: int,
    body: LabTestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new lab test for a specific patient."""
    patient = get_patient_or_404(patient_id, db)
    test = LabTest(patient_id=patient_id, **body.model_dump(exclude_unset=True))
    db.add(test)
    db.commit()
    db.refresh(test)

    user_id = getattr(current_user, "id", None)
    if user_id:
        log_activity(
            db=db,
            action="test_created",
            user_id=user_id,
            resource_type="lab_test",
            resource_id=str(test.id),
            details={
                "test_name": test.test_name,
                "patient_id": patient_id,
                "patient_name": patient.name or f"{patient.first_name} {patient.last_name}",
            },
        )
    return test


@router.get("/{test_id}", response_model=LabTestResponse)
def get_test(patient_id: int, test_id: int, db: Session = Depends(get_db)):
    """Get a single lab test by ID for a specific patient."""
    get_patient_or_404(patient_id, db)
    return get_test_or_404(patient_id, test_id, db)


@router.put("/{test_id}", response_model=LabTestResponse)
def update_test(
    patient_id: int,
    test_id: int,
    body: LabTestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a lab test for a specific patient."""
    get_patient_or_404(patient_id, db)
    test = get_test_or_404(patient_id, test_id, db)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(test, field, value)

    db.commit()
    db.refresh(test)

    user_id = getattr(current_user, "id", None)
    if user_id:
        log_activity(
            db=db,
            action="test_updated",
            user_id=user_id,
            resource_type="lab_test",
            resource_id=str(test.id),
            details={"updated_fields": list(body.model_dump(exclude_unset=True).keys())},
        )
    return test


@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_test(
    patient_id: int,
    test_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a lab test for a specific patient."""
    get_patient_or_404(patient_id, db)
    test = get_test_or_404(patient_id, test_id, db)

    test_name = test.test_name
    db.delete(test)
    db.commit()

    user_id = getattr(current_user, "id", None)
    if user_id:
        log_activity(
            db=db,
            action="test_deleted",
            user_id=user_id,
            resource_type="lab_test",
            resource_id=str(test_id),
            details={"test_name": test_name, "patient_id": patient_id},
        )
    return None
