import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_role
from app.models.user import User
from app.models.patient import Patient
from app.models.lab_test import LabTest
from app.schemas.patient import PatientCreate, PatientUpdate, PatientResponse, LabTestResponse
from app.activity_logger import log_activity

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("", response_model=List[PatientResponse])
def list_patients(db: Session = Depends(get_db)):
    """List all patients."""
    return db.query(Patient).all()


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
def create_patient(
    body: PatientCreate,
    current_user: User = Depends(require_role("lab_manager", "specimen_collector")),
    db: Session = Depends(get_db),
):
    """Create a new patient record."""
    patient = Patient(
        name=body.name,
        dob=body.dob,
        address=body.address,
        phone=body.phone,
        email=body.email,
        insurance_provider=body.insurance_provider,
        policy_number=body.policy_number,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)

    log_activity(
        db=db,
        action="patient_created",
        user_id=current_user.id,
        resource_type="patient",
        resource_id=str(patient.id),
        details={"name": patient.name, "dob": patient.dob},
    )
    return patient


@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient(patient_id: int, db: Session = Depends(get_db)):
    """Get full details for a single patient by ID."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID {patient_id} not found",
        )
    return patient


@router.put("/{patient_id}", response_model=PatientResponse)
def update_patient(
    patient_id: int,
    body: PatientUpdate,
    current_user: User = Depends(require_role("lab_manager", "specimen_collector")),
    db: Session = Depends(get_db),
):
    """Update patient details."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID {patient_id} not found",
        )

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(patient, field, value)

    db.commit()
    db.refresh(patient)

    log_activity(
        db=db,
        action="patient_updated",
        user_id=current_user.id,
        resource_type="patient",
        resource_id=str(patient.id),
        details={"updated_fields": list(body.model_dump(exclude_unset=True).keys())},
    )
    return patient


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(
    patient_id: int,
    current_user: User = Depends(require_role("lab_manager")),
    db: Session = Depends(get_db),
):
    """Delete a patient record by ID.

    Access is restricted to lab_manager role.
    If the patient has linked lab tests, deletion is blocked with a 400 Bad Request.
    The deletion action is written to the activity log.
    """
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID {patient_id} not found",
        )

    # Check for linked tests - block deletion if tests exist
    linked_tests_count = db.query(LabTest).filter(LabTest.patient_id == patient_id).count()
    if linked_tests_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete patient with ID {patient_id}: {linked_tests_count} linked lab test(s) exist. Resolve or reassign tests before deleting.",
        )

    patient_name = patient.name

    db.delete(patient)
    db.commit()

    # Record deletion to activity log
    log_activity(
        db=db,
        action="delete_patient",
        user_id=current_user.id,
        resource_type="patient",
        resource_id=str(patient_id),
        details={"patient_id": patient_id, "patient_name": patient_name},
    )

    return None
