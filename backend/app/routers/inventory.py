from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.activity_hooks import INVENTORY_REMOVED, log_inventory_change
from app.database import get_db
from app.inventory import TEST_SUPPLIES
from app.dependencies import LAB_MANAGER, LAB_STAFF_ROLES, SPECIMEN_COLLECTOR, require_role
from app.models.inventory import InventoryItem
from app.models.tests import Test
from app.models.user import User
from app.notifications import emit_expiring_soon_notification, emit_low_stock_notification
from app.schemas.inventory import (
    AvailabilityResponse,
    InventoryItemResponse,
    InventoryReceiveRequest,
    LotLookupResponse,
    SupplyCheck,
)


router = APIRouter(
    prefix="/inventory",
    tags=["inventory"],
    dependencies=[Depends(require_role(*LAB_STAFF_ROLES))],
)

LOW_STOCK_RATIO = 0.2


@router.get("", response_model=list[InventoryItemResponse])
def list_inventory(
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """List inventory items, optionally filtered by name or lot/batch number."""
    query = db.query(InventoryItem)
    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                InventoryItem.item_name.ilike(term),
                InventoryItem.lot_number.ilike(term),
                InventoryItem.batch_number.ilike(term),
            )
        )
    return query.order_by(InventoryItem.item_name, InventoryItem.id).all()


@router.get("/low-stock", response_model=list[InventoryItemResponse])
def low_stock(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(LAB_MANAGER)),
):
    """Items whose quantity is below 20% of their reorder threshold.

    ConOps 6.4.2: low-stock notifications go to the lab manager.
    """
    items = (
        db.query(InventoryItem)
        .filter(InventoryItem.quantity < InventoryItem.reorder_threshold * LOW_STOCK_RATIO)
        .order_by(InventoryItem.quantity)
        .all()
    )
    for item in items:
        emit_low_stock_notification(
            item_id=item.id,
            item_name=item.item_name,
            quantity=item.quantity,
            reorder_threshold=item.reorder_threshold,
        )
    return items


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
    items = (
        db.query(InventoryItem)
        .filter(InventoryItem.expiration_date <= cutoff)
        .order_by(InventoryItem.expiration_date)
        .all()
    )
    today = date.today()
    for item in items:
        days_left = (item.expiration_date - today).days if item.expiration_date else None
        emit_expiring_soon_notification(
            item_id=item.id,
            item_name=item.item_name,
            lot_number=item.lot_number,
            expiration_date=item.expiration_date,
            days_until_expiration=days_left,
        )
    return items


@router.post("/receive", response_model=InventoryItemResponse, status_code=status.HTTP_200_OK)
def receive_supplies(
    payload: InventoryReceiveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*LAB_STAFF_ROLES)),
):
    """Update stock when new supplies arrive (or create a new inventory batch/lot)."""
    item: InventoryItem | None = None
    if payload.item_id is not None:
        item = db.get(InventoryItem, payload.item_id)
        if item is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Inventory item with ID {payload.item_id} not found")
        item.quantity += payload.quantity
        if payload.reorder_threshold is not None:
            item.reorder_threshold = payload.reorder_threshold
        if payload.expiration_date is not None:
            item.expiration_date = payload.expiration_date
        if payload.batch_number is not None:
            item.batch_number = payload.batch_number
        if payload.lot_number is not None:
            item.lot_number = payload.lot_number
        if payload.machine_id is not None:
            item.machine_id = payload.machine_id
    elif payload.lot_number:
        item = (
            db.query(InventoryItem)
            .filter(
                InventoryItem.item_name == payload.item_name,
                InventoryItem.lot_number == payload.lot_number,
            )
            .first()
        )
        if item is not None:
            item.quantity += payload.quantity
            if payload.expiration_date is not None:
                item.expiration_date = payload.expiration_date
            if payload.reorder_threshold is not None:
                item.reorder_threshold = payload.reorder_threshold
            if payload.machine_id is not None:
                item.machine_id = payload.machine_id
            if payload.batch_number is not None:
                item.batch_number = payload.batch_number

    if item is None:
        item = InventoryItem(
            item_name=payload.item_name,
            batch_number=payload.batch_number,
            lot_number=payload.lot_number,
            quantity=payload.quantity,
            expiration_date=payload.expiration_date,
            reorder_threshold=payload.reorder_threshold if payload.reorder_threshold is not None else 0,
            machine_id=payload.machine_id,
        )
        db.add(item)

    db.commit()
    db.refresh(item)

    log_activity(
        db=db,
        action="inventory_received",
        user_id=current_user.id,
        resource_type="inventory",
        resource_id=str(item.id),
        details={
            "item_name": item.item_name,
            "quantity_received": payload.quantity,
            "new_total_quantity": item.quantity,
            "batch_number": item.batch_number,
            "lot_number": item.lot_number,
            "expiration_date": str(item.expiration_date) if item.expiration_date else None,
        },
    )

    return item



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

    # Log before deleting so the item's details are still readable; the removal
    # and its log entry are committed together.
    log_inventory_change(db, current_user.id, INVENTORY_REMOVED, item, reason=reason)
    db.delete(item)
    db.commit()
    return None