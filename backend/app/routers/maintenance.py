from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.activity_logger import log_activity
from app.database import get_db
from app.dependencies import LAB_STAFF_ROLES, require_role
from app.models.maintenance import MaintenanceLog
from app.models.tests import Instrument
from app.models.user import User
from app.schemas.maintenance import MaintenanceLogCreate, MaintenanceLogResponse

router = APIRouter(
    tags=["equipment_maintenance"],
    dependencies=[Depends(require_role(*LAB_STAFF_ROLES))],
)


@router.get("/equipment/maintenance", response_model=list[MaintenanceLogResponse])
@router.get("/maintenance", response_model=list[MaintenanceLogResponse])
def list_maintenance_logs(
    instrument_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    maintenance_type: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """List maintenance history records, optionally filtered by instrument, status, or type."""
    query = (
        db.query(MaintenanceLog)
        .options(selectinload(MaintenanceLog.instrument))
        .order_by(MaintenanceLog.maintenance_date.desc(), MaintenanceLog.id.desc())
    )

    if instrument_id is not None:
        query = query.filter(MaintenanceLog.instrument_id == instrument_id)
    if status_filter:
        query = query.filter(MaintenanceLog.status.ilike(f"%{status_filter}%"))
    if maintenance_type:
        query = query.filter(MaintenanceLog.maintenance_type.ilike(f"%{maintenance_type}%"))

    return query.all()


@router.get("/equipment/maintenance/{log_id}", response_model=MaintenanceLogResponse)
@router.get("/maintenance/{log_id}", response_model=MaintenanceLogResponse)
def get_maintenance_log(
    log_id: int,
    db: Session = Depends(get_db),
):
    """Retrieve details for a single equipment maintenance log."""
    log = (
        db.query(MaintenanceLog)
        .options(selectinload(MaintenanceLog.instrument))
        .filter(MaintenanceLog.id == log_id)
        .first()
    )
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Maintenance log #{log_id} not found",
        )
    return log


@router.post("/equipment/maintenance", response_model=MaintenanceLogResponse, status_code=status.HTTP_201_CREATED)
@router.post("/maintenance", response_model=MaintenanceLogResponse, status_code=status.HTTP_201_CREATED)
def create_maintenance_log(
    payload: MaintenanceLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*LAB_STAFF_ROLES)),
):
    """Record a new equipment maintenance, calibration, or servicing log."""
    instrument = db.get(Instrument, payload.instrument_id)
    if instrument is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Instrument with ID {payload.instrument_id} not found",
        )

    log_date = payload.maintenance_date or datetime.now(timezone.utc)
    performed_name = payload.performed_by_name or current_user.email or current_user.username or "Lab Staff"

    log_entry = MaintenanceLog(
        instrument_id=payload.instrument_id,
        maintenance_type=payload.maintenance_type,
        maintenance_date=log_date,
        performed_by_id=current_user.id,
        performed_by_name=performed_name,
        status=payload.status,
        notes=payload.notes,
        next_due_date=payload.next_due_date,
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)

    log_activity(
        db=db,
        action="equipment_maintenance_logged",
        user_id=current_user.id,
        resource_type="instrument",
        resource_id=str(instrument.id),
        details={
            "instrument_name": instrument.name,
            "maintenance_type": log_entry.maintenance_type,
            "status": log_entry.status,
            "maintenance_date": str(log_entry.maintenance_date),
            "next_due_date": str(log_entry.next_due_date) if log_entry.next_due_date else None,
        },
    )

    return log_entry
