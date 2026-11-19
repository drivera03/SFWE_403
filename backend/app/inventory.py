"""Supply requirements and transactional inventory consumption for test intake."""
import json
from datetime import date

from fastapi import HTTPException
from sqlalchemy import or_, update
from sqlalchemy.orm import Session

from app.models.activity_log import ActivityLog
from app.models.inventory import InventoryItem

# Supplies each test type needs: {test_name: {item_name: quantity_needed}}
# Add an entry here when a new test type is offered.
TEST_SUPPLIES: dict[str, dict[str, int]] = {
    "Lipid Panel": {"Lipid Reagent Kit": 1, "Serum Tube": 1},
    "Lipids": {"Lipid Reagent Kit": 1, "Serum Tube": 1},
    "Lipid Panel (Lipids)": {"Lipid Reagent Kit": 1, "Serum Tube": 1},
    "Complete Blood Count": {"CBC Reagent Pack": 1, "EDTA Tube": 1},
    "CBC": {"CBC Reagent Pack": 1, "EDTA Tube": 1},
    "Complete Blood Count (CBC)": {"CBC Reagent Pack": 1, "EDTA Tube": 1},
    "Urinalysis": {"Urine Test Strip": 1, "Urine Cup": 1},
    "UA": {"Urine Test Strip": 1, "Urine Cup": 1},
    "Urinalysis (UA)": {"Urine Test Strip": 1, "Urine Cup": 1},
}


def get_test_supplies(test_name: str) -> dict[str, int] | None:
    """Lookup required supplies with flexible matching and alias normalization."""
    if not test_name:
        return None
    # 1. Exact match
    if test_name in TEST_SUPPLIES:
        return TEST_SUPPLIES[test_name]

    # 2. Case-insensitive exact match
    clean_lower = test_name.strip().lower()
    for k, v in TEST_SUPPLIES.items():
        if k.lower() == clean_lower:
            return v

    # 3. Keyword / substring matching
    if "cbc" in clean_lower or "complete blood count" in clean_lower:
        return TEST_SUPPLIES["Complete Blood Count"]
    if "lipid" in clean_lower:
        return TEST_SUPPLIES["Lipid Panel"]
    if "urinalysis" in clean_lower or clean_lower == "ua" or "urine" in clean_lower:
        return TEST_SUPPLIES["Urinalysis"]

    return None


def deduct_test_supplies(db: Session, test_name: str, test_id: int, user_id: int):
    """Consume earliest-expiring lots. The caller commits or rolls back the transaction."""
    requirements = get_test_supplies(test_name)
    if requirements is None:
        raise HTTPException(422, f"No supply list for test '{test_name}'")

    for item_name, needed in sorted(requirements.items()):
        lots = (
            db.query(InventoryItem)
            .filter(
                InventoryItem.item_name == item_name,
                InventoryItem.quantity > 0,
                or_(InventoryItem.expiration_date.is_(None),
                    InventoryItem.expiration_date >= date.today()),
            )
            .order_by(InventoryItem.expiration_date.asc().nulls_last(), InventoryItem.id)
            .with_for_update()
            .all()
        )
        remaining = needed
        for lot in lots:
            consumed = min(lot.quantity, remaining)
            # Guard the write as well as locking rows so stock cannot go negative.
            result = db.execute(
                update(InventoryItem)
                .where(InventoryItem.id == lot.id, InventoryItem.quantity >= consumed)
                .values(quantity=InventoryItem.quantity - consumed)
                .execution_options(synchronize_session=False)
            )
            if result.rowcount != 1:
                raise HTTPException(409, "Inventory changed; retry submitting the test")
            db.add(ActivityLog(
                user_id=user_id, action="inventory_deducted", resource_type="inventory",
                resource_id=str(lot.id),
                details=json.dumps({"test_id": test_id, "item_name": item_name,
                                    "lot_number": lot.lot_number, "batch_number": lot.batch_number,
                                    "quantity_deducted": consumed}),
            ))
            remaining -= consumed
            if remaining == 0:
                break
        if remaining:
            raise HTTPException(409, f"Insufficient unexpired stock for '{item_name}'")
