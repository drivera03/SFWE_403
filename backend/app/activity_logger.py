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
) -> ActivityLog:
    """Record an action to the database activity log and write to application logger."""
    details_str = json.dumps(details) if isinstance(details, (dict, list)) else (str(details) if details is not None else None)

    log_entry = ActivityLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        details=details_str,
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)

    logger.info(
        "[ACTIVITY LOG] action=%s user_id=%s resource_type=%s resource_id=%s details=%s",
        action,
        user_id,
        resource_type,
        resource_id,
        details_str,
    )
    return log_entry
