"""Point-of-sale purchases and receipt generation router (ConOps 6.5.1, 6.6, SXFT5-215)."""
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.activity_hooks import log_purchase
from app.database import get_db
from app.dependencies import require_role
from app.models.patient import Patient
from app.models.purchase import Purchase
from app.models.user import User
from app.schemas.purchase import PurchaseCreate, ReceiptResponse

CASHIER_ROLES = ("cashier", "billing", "lab_manager", "manager")

router = APIRouter(
    prefix="/purchases",
    tags=["purchases"],
    dependencies=[Depends(require_role(*CASHIER_ROLES))],
)


def format_receipt_text(purchase: Purchase, patient: Patient | None, cashier: User | None) -> str:
    """Format an itemized, human-readable receipt for thermal or letterhead printing."""
    date_str = purchase.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")
    patient_display = (
        f"{patient.first_name} {patient.last_name} (ID: #{patient.id})"
        if patient
        else "Walk-In / Self-Pay"
    )
    if cashier:
        cashier_display = cashier.email or cashier.username or f"User #{cashier.id}"
    else:
        cashier_display = f"Cashier #{purchase.cashier_id}"

    lines = [
        "==================================================",
        "          CLMS CLINICAL LABORATORY RECEIPT        ",
        "==================================================",
        f"Receipt #:      {purchase.receipt_number}",
        f"Date:           {date_str}",
        f"Cashier:        {cashier_display}",
        f"Patient:        {patient_display}",
        f"Payment Method: {purchase.payment_method.upper()}",
        f"Status:         {purchase.status.upper()}",
        "--------------------------------------------------",
        f"{'Item Description':<36} {'Amount':>11}",
        "--------------------------------------------------",
    ]

    for item in purchase.items:
        desc = item.get("description", "Lab Service")[:35]
        amt = float(item.get("amount", 0.0))
        lines.append(f"{desc:<36} ${amt:>10.2f}")

    lines.extend([
        "--------------------------------------------------",
        f"{'TOTAL PAID:':<36} ${float(purchase.total):>10.2f}",
        "==================================================",
        "        Thank you for your visit to CLMS!         ",
        "==================================================",
    ])
    return "\n".join(lines)


@router.post("", response_model=ReceiptResponse, status_code=status.HTTP_201_CREATED)
def create_purchase(
    body: PurchaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*CASHIER_ROLES)),
):
    """Complete a point-of-sale purchase and generate an official receipt (SXFT5-215).

    Requires cashier, billing, or manager role. Logs purchase_completed audit event.
    """
    patient = None
    if body.patient_id is not None:
        patient = db.get(Patient, body.patient_id)
        if patient is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Patient with ID {body.patient_id} not found",
            )

    items_data = [item.model_dump() for item in body.items]
    computed_total = sum(Decimal(str(item["amount"])) for item in items_data)
    total_val = Decimal(str(body.total)) if body.total is not None else computed_total

    # Generate unique receipt number: RCP-YYYYMMDD-XXXX
    date_part = datetime.now(timezone.utc).strftime("%Y%m%d")
    unique_suffix = uuid.uuid4().hex[:6].upper()
    receipt_num = f"RCP-{date_part}-{unique_suffix}"

    purchase = Purchase(
        receipt_number=receipt_num,
        patient_id=body.patient_id,
        cashier_id=current_user.id,
        total=total_val,
        payment_method=body.payment_method.lower(),
        status="completed",
        items_json=json.dumps(items_data),
        notes=body.notes,
        created_at=datetime.now(timezone.utc),
    )
    db.add(purchase)
    db.flush()

    # Collect test IDs for audit log hook
    test_ids = [item["test_id"] for item in items_data if item.get("test_id") is not None]

    # Transactional activity hook
    log_purchase(
        db=db,
        user_id=current_user.id,
        purchase_id=purchase.id,
        total=total_val,
        payment_method=purchase.payment_method,
        patient_id=purchase.patient_id,
        test_ids=test_ids,
        extra={"receipt_number": purchase.receipt_number},
    )

    db.commit()
    db.refresh(purchase)

    patient_name = (
        f"{patient.first_name} {patient.last_name}" if patient else None
    )
    formatted = format_receipt_text(purchase, patient, current_user)

    return ReceiptResponse(
        id=purchase.id,
        receipt_number=purchase.receipt_number,
        patient_id=purchase.patient_id,
        patient_name=patient_name,
        cashier_id=current_user.id,
        cashier_name=current_user.email or current_user.username,
        total=float(purchase.total),
        payment_method=purchase.payment_method,
        status=purchase.status,
        items=purchase.items,
        notes=purchase.notes,
        created_at=purchase.created_at,
        formatted_receipt=formatted,
    )


@router.get("/{purchase_id}", response_model=ReceiptResponse)
def get_purchase_receipt(
    purchase_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*CASHIER_ROLES)),
):
    """Retrieve an existing purchase receipt by purchase ID (SXFT5-215)."""
    purchase = (
        db.query(Purchase)
        .options(selectinload(Purchase.patient), selectinload(Purchase.cashier))
        .filter(Purchase.id == purchase_id)
        .first()
    )
    if purchase is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Purchase with ID {purchase_id} not found",
        )

    patient = purchase.patient
    cashier = purchase.cashier
    patient_name = f"{patient.first_name} {patient.last_name}" if patient else None
    formatted = format_receipt_text(purchase, patient, cashier)

    return ReceiptResponse(
        id=purchase.id,
        receipt_number=purchase.receipt_number,
        patient_id=purchase.patient_id,
        patient_name=patient_name,
        cashier_id=purchase.cashier_id,
        cashier_name=cashier.email if cashier else None,
        total=float(purchase.total),
        payment_method=purchase.payment_method,
        status=purchase.status,
        items=purchase.items,
        notes=purchase.notes,
        created_at=purchase.created_at,
        formatted_receipt=formatted,
    )


@router.get("", response_model=list[ReceiptResponse])
def list_purchases(
    patient_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*CASHIER_ROLES)),
):
    """List recent purchases/receipts, optionally filtered by patient."""
    query = (
        db.query(Purchase)
        .options(selectinload(Purchase.patient), selectinload(Purchase.cashier))
        .order_by(Purchase.created_at.desc(), Purchase.id.desc())
    )
    if patient_id is not None:
        query = query.filter(Purchase.patient_id == patient_id)

    purchases = query.all()
    results = []
    for p in purchases:
        patient = p.patient
        cashier = p.cashier
        patient_name = f"{patient.first_name} {patient.last_name}" if patient else None
        formatted = format_receipt_text(p, patient, cashier)
        results.append(
            ReceiptResponse(
                id=p.id,
                receipt_number=p.receipt_number,
                patient_id=p.patient_id,
                patient_name=patient_name,
                cashier_id=p.cashier_id,
                cashier_name=cashier.email if cashier else None,
                total=float(p.total),
                payment_method=p.payment_method,
                status=p.status,
                items=p.items,
                notes=p.notes,
                created_at=p.created_at,
                formatted_receipt=formatted,
            )
        )
    return results
