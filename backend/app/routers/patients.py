from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.patient import Patient
from app.schemas.patient import PatientCreate, PatientUpdate, PatientResponse

# Every patient route requires a logged-in user.
router = APIRouter(
    prefix="/patients",
    tags=["patients"],
    dependencies=[Depends(get_current_user)],
)


def get_patient_or_404(patient_id: int, db: Session) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
    return patient


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
def create_patient(body: PatientCreate, db: Session = Depends(get_db)):
    patient = Patient(**body.model_dump())
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@router.get("", response_model=list[PatientResponse])
def list_patients(db: Session = Depends(get_db)):
    return db.query(Patient).order_by(Patient.id).all()


@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient(patient_id: int, db: Session = Depends(get_db)):
    return get_patient_or_404(patient_id, db)


@router.put("/{patient_id}", response_model=PatientResponse)
def update_patient(patient_id: int, body: PatientUpdate, db: Session = Depends(get_db)):
    patient = get_patient_or_404(patient_id, db)
    for field, value in body.model_dump().items():
        setattr(patient, field, value)
    db.commit()
    db.refresh(patient)
    return patient


@router.delete(
    "/{patient_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role("lab_manager", "specimen_collector"))],
)
def delete_patient(patient_id: int, db: Session = Depends(get_db)):
    patient = get_patient_or_404(patient_id, db)
    db.delete(patient)
    db.commit()
    # TODO(activity log): deleting a patient is a sensitive action. Once the activity log
    # exists, record who deleted which patient id here. (Don't store patient names/details.)
