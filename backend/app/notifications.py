import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger("uvicorn.error")


def emit_lockout_notification(user_id: Any, email: str, locked_until: datetime) -> dict[str, Any]:
    """Emit a notification event when an account is locked after consecutive failed logins.

    Alerts the Lab Manager of the lockout event.
    Currently emits a log and console event; real email delivery will be implemented later.
    """
    locked_str = locked_until.isoformat() if hasattr(locked_until, "isoformat") else str(locked_until)
    message = (
        f"[NOTIFICATION EVENT: ACCOUNT LOCKOUT] User account locked: email={email}, "
        f"user_id={user_id}, locked_until={locked_str}. "
        f"Lab Manager notified."
    )
    logger.warning(message)
    print(message, flush=True)

    return {
        "event": "account_lockout",
        "user_id": user_id,
        "email": email,
        "locked_until": locked_str,
        "recipient_role": "lab_manager",
        "message": message,
    }
