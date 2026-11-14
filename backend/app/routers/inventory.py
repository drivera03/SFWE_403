from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.activity_logger import log_activity
from app.database import get_db
from app.dependencies import LAB_MANAGER, LAB_STAFF_ROLES, SPECIMEN_COLLECTOR, require_role
from app.models.inventory import InventoryItem
from app.models.tests import Test
from app.models.user import User
from app.schemas.inventory import (
    AvailabilityResponse,
    InventoryItemResponse,
    LotLookupResponse,
    SupplyCheck,
)

router = APIRouter(
    prefix="/inventory",
    tags=["inventory"],
    dependencies=[Depends(require_role(*LAB_STAFF_ROLES))],
)

LOW_STOCK_RATIO = 0.2

# Supplies each test type needs: {test_name: {item_name: quantity_needed}}
# Add an entry here when a new test type is offered.
TEST_SUPPLIES: dict[str, dict[str, int]] = {
    "Lipid Panel": {"Lipid Reagent Kit": 1, "Serum Tube": 1},
    "Complete Blood Count": {"CBC Reagent Pack": 1, "EDTA Tube": 1},
    "Urinalysis": {"Urine Test Strip": 1, "Urine Cup": 1},
}


@router.get("/low-stock", response_model=list[InventoryItemResponse])
def low_stock(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(LAB_MANAGER)),
):
    """Items whose quantity is below 20% of their reorder threshold.

    ConOps 6.4.2: low-stock notifications go to the lab manager.
    """
    return (
        db.query(InventoryItem)
        .filter(InventoryItem.quantity < InventoryItem.reorder_threshold * LOW_STOCK_RATIO)
        .order_by(InventoryItem.quantity)
        .all()
    )


@router.get("/expiring", response_model=list[InventoryItemResponse])
def expiring(
    days: int = Query(30, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(LAB_MANAGER)),
):
    """Items already expired or expiring within `days` from now (default 30).

    ConOps 6.4.6: expiration notifications go to the lab manager.
    """
    cutoff = date.today() + timedelta(days=days)
    return (
        db.query(InventoryItem)
        .filter(InventoryItem.expiration_date <= cutoff)
        .order_by(InventoryItem.expiration_date)
        .all()
    )


@router.get("/check-availability", response_model=AvailabilityResponse)
def check_availability(
    test_name: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(SPECIMEN_COLLECTOR)),
):
    """Check whether the supplies a test type needs are in stock and not expired.

    ConOps 6.3.3: only specimen collectors may check reagent availability.
    """
    needed_items = TEST_SUPPLIES.get(test_name)
    if needed_items is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No supply list for test '{test_name}'")

    today = date.today()
    supplies = []
    for item_name, needed in needed_items.items():
        # Add up every unexpired lot of this item
        available = (
            db.query(func.coalesce(func.sum(InventoryItem.quantity), 0))
            .filter(
                InventoryItem.item_name == item_name,
                or_(InventoryItem.expiration_date.is_(None), InventoryItem.expiration_date >= today),
            )
            .scalar()
        )
        supplies.append(
            SupplyCheck(item_name=item_name, needed=needed, available=available, ok=available >= needed)
        )

    return AvailabilityResponse(
        test_name=test_name,
        available=all(s.ok for s in supplies),
        supplies=supplies,
    )


@router.get("/lookup", response_model=LotLookupResponse)
def lot_lookup(number: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """Find every inventory item with this batch or lot number, plus tests run on the same machines."""
    items = (
        db.query(InventoryItem)
        .filter(or_(InventoryItem.batch_number == number, InventoryItem.lot_number == number))
        .all()
    )

    machine_ids = {item.machine_id for item in items if item.machine_id is not None}
    tests = []
    if machine_ids:
        tests = (
            db.query(Test)
            .options(selectinload(Test.physician), selectinload(Test.instrument))
            .filter(Test.instrument_id.in_(machine_ids))
            .order_by(Test.collection_datetime.desc())
            .all()
        )

    return LotLookupResponse(items=items, tests=tests)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: int,
    reason: str = Query(..., min_length=1, max_length=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(LAB_MANAGER)),
):
    """Remove an inventory item and log who removed it, when, and why (ConOps 6.4.7)."""
    item = db.get(InventoryItem, item_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Inventory item with ID {item_id} not found")

    details = {
        "reason": reason,
        "item_name": item.item_name,
        "batch_number": item.batch_number,
        "lot_number": item.lot_number,
        "quantity": item.quantity,
        "expiration_date": str(item.expiration_date) if item.expiration_date else None,
    }
    db.delete(item)
    db.commit()

    # log_activity stamps the time automatically
    log_activity(
        db=db,
        action="inventory_removed",
        user_id=current_user.id,
        resource_type="inventory",
        resource_id=str(item_id),
        details=details,
    )
    return None