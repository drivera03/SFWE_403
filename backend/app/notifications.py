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


def emit_low_stock_notification(
    item_id: Any,
    item_name: str,
    quantity: int,
    reorder_threshold: int,
) -> dict[str, Any]:
    """Emit a notification event when an inventory item falls below the low-stock threshold.

    Alerts the Lab Manager of the low-stock event (ConOps 6.4.2).
    Currently emits a log and console event; real email delivery will be implemented later.
    """
    message = (
        f"[NOTIFICATION EVENT: LOW STOCK] Inventory item low stock: item_id={item_id}, "
        f"item_name={item_name}, quantity={quantity}, reorder_threshold={reorder_threshold}. "
        f"Lab Manager notified."
    )
    logger.warning(message)
    print(message, flush=True)

    return {
        "event": "low_stock",
        "item_id": item_id,
        "item_name": item_name,
        "quantity": quantity,
        "reorder_threshold": reorder_threshold,
        "recipient_role": "lab_manager",
        "message": message,
    }


def emit_expiring_soon_notification(
    item_id: Any,
    item_name: str,
    lot_number: str | None,
    expiration_date: Any,
    days_until_expiration: int | None = None,
) -> dict[str, Any]:
    """Emit a notification event when an inventory item is expired or expiring soon.

    Alerts the Lab Manager of the expiring-soon event (ConOps 6.4.6).
    Currently emits a log and console event; real email delivery will be implemented later.
    """
    exp_str = expiration_date.isoformat() if hasattr(expiration_date, "isoformat") else str(expiration_date)
    days_info = f", days_left={days_until_expiration}" if days_until_expiration is not None else ""
    message = (
        f"[NOTIFICATION EVENT: EXPIRING SOON] Inventory item expiring: item_id={item_id}, "
        f"item_name={item_name}, lot_number={lot_number}, expiration_date={exp_str}{days_info}. "
        f"Lab Manager notified."
    )
    logger.warning(message)
    print(message, flush=True)

    return {
        "event": "expiring_soon",
        "item_id": item_id,
        "item_name": item_name,
        "lot_number": lot_number,
        "expiration_date": exp_str,
        "days_until_expiration": days_until_expiration,
        "recipient_role": "lab_manager",
        "message": message,
    }

