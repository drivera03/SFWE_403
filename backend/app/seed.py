from app.database import SessionLocal
from app.models.user import User
from app.models.tests import Physician, Instrument
from app.security import password_hash

# TEMPORARY: demo accounts for development. Remove once real accounts exist.
DEMO_USERS = [
    ("tech@example.com", "technician", "changeme123"),
    ("mason@example.com", "manager", "password456"),
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

        db.commit()
    finally:
        db.close()
