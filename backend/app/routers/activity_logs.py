import json
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_role
from app.models.activity_log import ActivityLog
from app.models.user import User
from app.schemas.activity_log import ActivityLogResponse

# Activity logs are an audit trail (ConOps 6.3.6, 6.4.7, 6.5.1), so only lab managers may read them.
router = APIRouter(
    prefix="/activity-logs",
    tags=["activity-logs"],
    dependencies=[Depends(require_role("lab_manager"))],
)


def start_of_day(day: date) -> datetime:
    """Midnight UTC at the start of `day` (timestamps are stored in UTC)."""
    return datetime.combine(day, time.min, tzinfo=timezone.utc)


def parse_details(raw: str | None):
    """Details are stored as a JSON string; return the parsed value, or the raw text if it isn't JSON."""
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return raw


@router.get("", response_model=list[ActivityLogResponse])
def list_activity_logs(
    user_id: int | None = Query(None, description="Only entries by this user"),
    action: str | None = Query(None, min_length=1, description="Exact action name, e.g. patient_created"),
    on_date: date | None = Query(None, alias="date", description="Only entries on this day (UTC)"),
    start_date: date | None = Query(None, description="Range start, inclusive (UTC)"),
    end_date: date | None = Query(None, description="Range end, inclusive (UTC)"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List activity log entries, newest first, with optional filters.

    Filters combine with AND. Use either `date` for a single day or
    `start_date`/`end_date` for a range (either end may be left open).
    """
    if on_date is not None and (start_date is not None or end_date is not None):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Use either 'date' or 'start_date'/'end_date', not both",
        )
    if start_date is not None and end_date is not None and start_date > end_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "start_date must be on or before end_date")

    if on_date is not None:
        start_date = end_date = on_date

    query = db.query(ActivityLog, User).outerjoin(User, User.id == ActivityLog.user_id)

    if user_id is not None:
        query = query.filter(ActivityLog.user_id == user_id)
    if action is not None:
        query = query.filter(ActivityLog.action == action)
    if start_date is not None:
        query = query.filter(ActivityLog.timestamp >= start_of_day(start_date))
    if end_date is not None:
        # Half-open upper bound so the whole end day is included.
        query = query.filter(ActivityLog.timestamp < start_of_day(end_date + timedelta(days=1)))

    rows = (
        query.order_by(ActivityLog.timestamp.desc(), ActivityLog.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [
        ActivityLogResponse(
            id=log.id,
            user_id=log.user_id,
            username=user.username if user else None,
            email=user.email if user else None,
            action=log.action,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            details=parse_details(log.details),
            timestamp=log.timestamp,
        )
        for log, user in rows
    ]
