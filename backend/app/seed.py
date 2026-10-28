from app.database import SessionLocal
from app.models.user import User
from app.security import password_hash

# TEMPORARY: demo accounts for development. Remove once real accounts exist.
DEMO_USERS = [
    ("tech@example.com", "technician", "changeme123"),
    ("mason@example.com", "manager", "password456"),
]


def seed_demo_users() -> None:
    db = SessionLocal()
    try:
        for email, role, password in DEMO_USERS:
            if not db.query(User).filter(User.email == email).first():
                db.add(User(email=email, role=role, password_hash=password_hash.hash(password)))
        db.commit()
    finally:
        db.close()