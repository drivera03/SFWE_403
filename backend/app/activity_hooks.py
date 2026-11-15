"""Activity-log hooks for inventory, purchase, and test-result actions.

Each hook writes one ActivityLog entry recording who did it (user_id), what
happened (action), and when (timestamp, stamped automatically), plus details
about the affected record.

Hooks add the entry to the caller's session WITHOUT committing, so the change
and its log entry are saved together. Call the hook after making the change
and before ``db.commit()``:

    item.quantity += body.quantity
    log_inventory_change(db, current_user.id, INVENTORY_RECEIVED, item, previous_quantity=old_qty)
    db.commit()

Related ConOps requirements: 6.3.6 Activity Log, 6.4.7 Remove Inventory,
6.5.1 Transaction logging (logins, purchases, inventory updates).
"""
from collections.abc import Iterable, Mapping
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.activity_logger import log_activity
from app.models.activity_log import ActivityLog
from app.models.inventory import InventoryItem
from app.models.tests import ResultStatus, Test

# ---------------------------------------------------------------------------
# Action names. Use these constants instead of string literals so the activity
# log filter dropdown shows one consistent name per action.
# ---------------------------------------------------------------------------

# Inventory (ConOps 6.4)
INVENTORY_RECEIVED = "inventory_received"    # 6.4.4 new supply received from a distributor
INVENTORY_USED = "inventory_used"            # 6.4.1 / 6.4.5 consumed by a test
INVENTORY_ADJUSTED = "inventory_adjusted"    # manual count correction
INVENTORY_ORDERED = "inventory_ordered"      # 6.4.3 lab manager orders more
INVENTORY_REMOVED = "inventory_removed"      # 6.4.7 removed (expired or other reason)

INVENTORY_ACTIONS = frozenset({
    INVENTORY_RECEIVED,
    INVENTORY_USED,
    INVENTORY_ADJUSTED,
    INVENTORY_ORDERED,
    INVENTORY_REMOVED,
})

# Purchases / billing (ConOps 6.6)
PURCHASE_COMPLETED = "purchase_completed"

# Test results (ConOps 6.3.5)
RESULT_ENTERED = "result_entered"                 # first result recorded on a test
RESULT_UPDATED = "result_updated"                 # an existing result value was changed
RESULT_STATUS_CHANGED = "result_status_changed"   # pending -> completed -> validated

RESULT_FIELDS = ("result_numeric", "result_text")


def _require_user(user_id: int | None) -> int:
    # These actions always have a person behind them; a missing user is a bug in the caller.
    if user_id is None:
        raise ValueError("Activity hooks require the id of the user performing the action")
    return user_id


def _plain(value: Any) -> Any:
    """Make a value JSON-serializable for the details column."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, ResultStatus):
        return value.value
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

def log_inventory_change(
    db: Session,
    user_id: int | None,
    action: str,
    item: InventoryItem,
    *,
    previous_quantity: int | None = None,
    reason: str | None = None,
    extra: Mapping[str, Any] | None = None,
) -> ActivityLog:
    """Log a change to an inventory item.

    Pass `previous_quantity` when the quantity changed so the entry records the
    before/after and the change. Call before `db.delete(item)` for removals so the
    item's details are still readable.
    """
    if action not in INVENTORY_ACTIONS:
        raise ValueError(f"Unknown inventory action '{action}'")

    details: dict[str, Any] = {
        "item_name": item.item_name,
        "lot_number": item.lot_number,
        "batch_number": item.batch_number,
        "quantity": item.quantity,
        "expiration_date": _plain(item.expiration_date),
    }
    if previous_quantity is not None:
        details["previous_quantity"] = previous_quantity
        details["quantity_change"] = (item.quantity or 0) - previous_quantity
    if reason is not None:
        details["reason"] = reason
    if extra:
        details.update({key: _plain(value) for key, value in extra.items()})

    return log_activity(
        db=db,
        action=action,
        user_id=_require_user(user_id),
        resource_type="inventory",
        resource_id=str(item.id) if item.id is not None else None,
        details=details,
        commit=False,
    )


# ---------------------------------------------------------------------------
# Purchases
# ---------------------------------------------------------------------------

def log_purchase(
    db: Session,
    user_id: int | None,
    purchase_id: int | str,
    *,
    total: Decimal | float,
    payment_method: str,
    patient_id: int | None = None,
    test_ids: Iterable[int] = (),
    extra: Mapping[str, Any] | None = None,
) -> ActivityLog:
    """Log a completed point-of-sale purchase (ConOps 6.5.1, 6.6)."""
    details: dict[str, Any] = {
        "total": _plain(total),
        "payment_method": payment_method,
        "patient_id": patient_id,
        "test_ids": list(test_ids),
    }
    if extra:
        details.update({key: _plain(value) for key, value in extra.items()})

    return log_activity(
        db=db,
        action=PURCHASE_COMPLETED,
        user_id=_require_user(user_id),
        resource_type="purchase",
        resource_id=str(purchase_id),
        details=details,
        commit=False,
    )


# ---------------------------------------------------------------------------
# Test results
# ---------------------------------------------------------------------------

def snapshot_result(test: Test) -> dict[str, Any]:
    """Capture a test's result fields and status before changing them."""
    return {
        "result_numeric": _plain(test.result_numeric),
        "result_text": test.result_text,
        "status": _plain(test.status),
    }


def _result_changed(before: Any, after: Any) -> bool:
    # Numeric results come back from the DB as Decimal but arrive from the API as float.
    if isinstance(before, (int, float)) and isinstance(after, (int, float, Decimal)):
        return float(before) != float(after)
    return before != _plain(after)


def log_result_changes(
    db: Session,
    user_id: int | None,
    test: Test,
    before: Mapping[str, Any],
) -> list[ActivityLog]:
    """Compare a test against its `snapshot_result()` and log what changed.

    Writes a result_entered or result_updated entry if the result value changed,
    and a result_status_changed entry if the status changed. Returns the entries
    written (empty if nothing result-related changed).
    """
    user_id = _require_user(user_id)
    base = {
        "test_name": test.test_name,
        "patient_id": test.patient_id,
        "sample_id": test.sample_id,
    }
    entries: list[ActivityLog] = []

    after_values = {field: getattr(test, field) for field in RESULT_FIELDS}
    if any(_result_changed(before.get(field), after_values[field]) for field in RESULT_FIELDS):
        had_result = before.get("result_numeric") is not None or before.get("result_text") is not None
        details = {
            **base,
            "result_numeric": _plain(after_values["result_numeric"]),
            "result_text": after_values["result_text"],
            "units": test.units,
        }
        if had_result:
            details["previous_result_numeric"] = before.get("result_numeric")
            details["previous_result_text"] = before.get("result_text")
        entries.append(log_activity(
            db=db,
            action=RESULT_UPDATED if had_result else RESULT_ENTERED,
            user_id=user_id,
            resource_type="test",
            resource_id=str(test.id),
            details=details,
            commit=False,
        ))

    new_status = _plain(test.status)
    if before.get("status") != new_status:
        entries.append(log_activity(
            db=db,
            action=RESULT_STATUS_CHANGED,
            user_id=user_id,
            resource_type="test",
            resource_id=str(test.id),
            details={**base, "previous_status": before.get("status"), "status": new_status},
            commit=False,
        ))

    return entries
