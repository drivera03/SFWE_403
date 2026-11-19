from datetime import date, datetime, timedelta, timezone

from app.database import SessionLocal
from app.models.inventory import InventoryItem
from app.models.maintenance import MaintenanceLog
from app.models.tests import Instrument, Physician
from app.models.user import User
from app.security import password_hash



# TEMPORARY: demo accounts for development. Remove once real accounts exist.
DEMO_USERS = [
    ("tech@example.com", "technician", "changeme123"),
    ("collector@example.com", "specimen_collector", "changeme123"),
    ("mason@example.com", "lab_manager", "password456"),
    ("cashier@example.com", "cashier", "changeme123"),
    ("pathologist@example.com", "pathologist", "changeme123"),
    ("billing@example.com", "billing", "changeme123"),
]

DEMO_PHYSICIANS = [
    "Dr. Gregory House",
    "Dr. Allison Cameron",
    "Dr. Robert Chase",
    "Dr. Lisa Cuddy",
    "Dr. James Wilson",
]

DEMO_INSTRUMENTS = [
    "Sysmex XN-1000",
    "Roche Cobas 6000",
    "Abbott Architect c8000",
    "Beckman Coulter DxH 900",
]


def seed_demo_users() -> None:
    db = SessionLocal()
    try:
        for email, role, password in DEMO_USERS:
            if not db.query(User).filter(User.email == email).first():
                username = email.split('@')[0]
                db.add(User(username=username, email=email, role=role, password_hash=password_hash.hash(password)))

        for p_name in DEMO_PHYSICIANS:
            if not db.query(Physician).filter(Physician.name == p_name).first():
                db.add(Physician(name=p_name))

        for inst_name in DEMO_INSTRUMENTS:
            if not db.query(Instrument).filter(Instrument.name == inst_name).first():
                db.add(Instrument(name=inst_name))

        db.flush()
        instruments = {inst.name: inst for inst in db.query(Instrument).all()}
        now = datetime.now(timezone.utc)
        today = date.today()

        if not db.query(MaintenanceLog).first():
            tech_user = db.query(User).filter(User.role == "technician").first()

            sample_logs = [
                MaintenanceLog(
                    instrument_id=instruments["Sysmex XN-1000"].id,
                    maintenance_type="Calibration",
                    maintenance_date=now - timedelta(days=2),
                    performed_by_id=tech_user.id if tech_user else None,
                    performed_by_name="tech@example.com",
                    status="Passed",
                    notes="Three-level hematology control checks within 1 SD tolerance.",
                    next_due_date=today + timedelta(days=28),
                ),
                MaintenanceLog(
                    instrument_id=instruments["Sysmex XN-1000"].id,
                    maintenance_type="Routine Cleaning",
                    maintenance_date=now - timedelta(days=7),
                    performed_by_id=tech_user.id if tech_user else None,
                    performed_by_name="tech@example.com",
                    status="Completed",
                    notes="Aspiration probe rinsed and waste trap emptied.",
                    next_due_date=today + timedelta(days=7),
                ),
                MaintenanceLog(
                    instrument_id=instruments["Roche Cobas 6000"].id,
                    maintenance_type="Preventative Maintenance",
                    maintenance_date=now - timedelta(days=12),
                    performed_by_id=tech_user.id if tech_user else None,
                    performed_by_name="Field Service Engineer",
                    status="Completed",
                    notes="Photometer lamp replaced, sample syringe seals lubricated.",
                    next_due_date=today + timedelta(days=168),
                ),
                MaintenanceLog(
                    instrument_id=instruments["Abbott Architect c8000"].id,
                    maintenance_type="Monthly Inspection",
                    maintenance_date=now - timedelta(days=20),
                    performed_by_id=tech_user.id if tech_user else None,
                    performed_by_name="tech@example.com",
                    status="Completed",
                    notes="Water bath flushed and re-filled. Temperature confirmed at 37.0°C.",
                    next_due_date=today + timedelta(days=10),
                ),
                MaintenanceLog(
                    instrument_id=instruments["Beckman Coulter DxH 900"].id,
                    maintenance_type="Flow Cell Alignment",
                    maintenance_date=now - timedelta(days=1),
                    performed_by_id=tech_user.id if tech_user else None,
                    performed_by_name="Senior Lab Technician",
                    status="Completed",
                    notes="Optical alignment confirmed with calibration bead standard.",
                    next_due_date=today + timedelta(days=60),
                ),
            ]
            db.add_all(sample_logs)

        if not db.query(InventoryItem).first():
            cobas = instruments.get("Roche Cobas 6000")
            sysmex = instruments.get("Sysmex XN-1000")
            today = date.today()

            db.add_all([
                # 1 < 10 * 0.2 (2) -> LOW STOCK and expiring in 12 days!
                InventoryItem(
                    item_name="Lipid Reagent Kit",
                    lot_number="LOT-LRK-101",
                    batch_number="B-2026-A",
                    quantity=1,
                    reorder_threshold=10,
                    expiration_date=today + timedelta(days=12),
                    machine_id=cobas.id if cobas else None,
                ),
                # 2 < 20 * 0.2 (4) -> LOW STOCK and expiring in 5 days!
                InventoryItem(
                    item_name="CBC Reagent Pack",
                    lot_number="LOT-CBC-404",
                    batch_number="B-2026-C",
                    quantity=2,
                    reorder_threshold=20,
                    expiration_date=today + timedelta(days=5),
                    machine_id=sysmex.id if sysmex else None,
                ),
                # 4 < 50 * 0.2 (10) -> LOW STOCK and expiring in 20 days!
                InventoryItem(
                    item_name="Urine Test Strip",
                    lot_number="LOT-UTS-222",
                    batch_number="B-2026-U",
                    quantity=4,
                    reorder_threshold=50,
                    expiration_date=today + timedelta(days=20),
                ),
                # Expired 2 days ago!
                InventoryItem(
                    item_name="Serum Separator Tube",
                    lot_number="LOT-SST-888",
                    batch_number="B-2025-X",
                    quantity=45,
                    reorder_threshold=10,
                    expiration_date=today - timedelta(days=2),
                ),
                # Plenty in stock and unexpired
                InventoryItem(
                    item_name="EDTA Tube",
                    lot_number="LOT-EDTA-500",
                    batch_number="B-2026-E",
                    quantity=150,
                    reorder_threshold=25,
                    expiration_date=today + timedelta(days=180),
                ),
            ])

        db.commit()


    finally:
        db.close()
