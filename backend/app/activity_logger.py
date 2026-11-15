import json
import logging
from typing import Any
from sqlalchemy.orm import Session
from app.models.activity_log import ActivityLog

logger = logging.getLogger("uvicorn.error")


def log_activity(
    db: Session,
    action: str,
    user_id: int | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    details: Any = None,
    commit: bool = True,
) -> ActivityLog:
    """Record an action to the database activity log and write to application logger.

    With commit=False the entry is only added to the session, so it is saved in the
    same transaction as the change it describes (the caller commits). Use that when
    a change must never be saved without its log entry.
    """
    details_str = json.dumps(details) if isinstance(details, (dict, list)) else (str(details) if details is not None else None)

    log_entry = ActivityLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        details=details_str,
    )
    db.add(log_entry)
    if commit:
        db.commit()
        db.refresh(log_entry)
    else:
        db.flush()  # assigns the id and timestamp without ending the caller's transaction

    logger.info(
        "[ACTIVITY LOG] action=%s user_id=%s resource_type=%s resource_id=%s details=%s",
        action,
        user_id,
        resource_type,
        resource_id,
        details_str,
    )
    return log_entry
