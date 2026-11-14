import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import LAB_MANAGER, LAB_STAFF_ROLES, SPECIMEN_COLLECTOR, require_role
from app.models.user import User
from app.models.patient import Patient
from app.models.tests import Test
from app.schemas.patient import PatientCreate, PatientUpdate, PatientResponse
from app.activity_logger import log_activity

logger = logging.getLogger("uvicorn.error")

# ConOps 6.1.4: all laboratory personnel may view, create, and update patient accounts.
router = APIRouter(
    prefix="/patients",
    tags=["patients"],
    dependencies=[Depends(require_role(*LAB_STAFF_ROLES))],
)


def get_patient_or_404(patient_id: int, db: Session) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID {patient_id} not found",
        )
    return patient


@router.get("", response_model=List[PatientResponse])
def list_patients(db: Session = Depends(get_db)):
    """List all patients."""
    return db.query(Patient).order_by(Patient.id).all()


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
def create_patient(
    body: PatientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*LAB_STAFF_ROLES)),
):
    """Create a new patient record."""
    patient = Patient(**body.model_dump(exclude_unset=True))
    db.add(patient)
    db.commit()
    db.refresh(patient)

    user_id = getattr(current_user, "id", None)
    if user_id:
        log_activity(
            db=db,
            action="patient_created",
            user_id=user_id,
            resource_type="patient",
            resource_id=str(patient.id),
            details={
                "name": patient.name or f"{patient.first_name} {patient.last_name}",
                "dob": patient.dob or str(patient.date_of_birth),
            },
        )
    return patient


@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient(patient_id: int, db: Session = Depends(get_db)):
    """Get full details for a single patient by ID."""
    return get_patient_or_404(patient_id, db)


@router.put("/{patient_id}", response_model=PatientResponse)
def update_patient(
    patient_id: int,
    body: PatientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*LAB_STAFF_ROLES)),
):
    """Update patient details."""
    patient = get_patient_or_404(patient_id, db)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(patient, field, value)

    # Sync name <-> first_name/last_name and dob <-> date_of_birth
    if (patient.first_name or patient.last_name) and not body.name:
        patient.name = f"{patient.first_name or ''} {patient.last_name or ''}".strip()
    if patient.date_of_birth and not body.dob:
        patient.dob = str(patient.date_of_birth)

    db.commit()
    db.refresh(patient)

    user_id = getattr(current_user, "id", None)
    if user_id:
        log_activity(
            db=db,
            action="patient_updated",
            user_id=user_id,
            resource_type="patient",
            resource_id=str(patient.id),
            details={"updated_fields": list(body.model_dump(exclude_unset=True).keys())},
        )
    return patient


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(
    patient_id: int,
    current_user: User = Depends(require_role(LAB_MANAGER, SPECIMEN_COLLECTOR)),
    db: Session = Depends(get_db),
):
    """Delete a patient record by ID.

    ConOps 6.1.5: only a specimen collector or lab manager may remove a patient.
    If the patient has linked lab tests, deletion is blocked with a 400 Bad Request.
    The deletion action is written to the activity log.
    """
    patient = get_patient_or_404(patient_id, db)

    # Check for linked tests - block deletion if tests exist
    linked_tests_count = db.query(Test).filter(Test.patient_id == patient_id).count()
    if linked_tests_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete patient with ID {patient_id}: {linked_tests_count} linked lab test(s) exist. Resolve or reassign tests before deleting.",
        )

    patient_name = patient.name or f"{patient.first_name or ''} {patient.last_name or ''}".strip()

    db.delete(patient)
    db.commit()

    # Record deletion to activity log
    user_id = getattr(current_user, "id", None)
    if user_id:
        log_activity(
            db=db,
            action="delete_patient",
            user_id=user_id,
            resource_type="patient",
            resource_id=str(patient_id),
            details={"patient_id": patient_id, "patient_name": patient_name},
        )

    return None
