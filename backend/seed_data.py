from app.database import engine, Base, SessionLocal
from app.models.user import User
from app.models.patient import Patient
from app.models.lab_test import LabTest
from app.security import password_hash

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Check if data already exists
    if db.query(User).filter_by(username="lab_manager").first():
        print("Database already seeded.")
        db.close()
        return

    print("Seeding database...")

    # Seed users
    manager = User(
        username="lab_manager",
        email="manager@clms.local",
        password_hash=password_hash.hash("Manager123!"),
        role="lab_manager",
        is_locked=False,
        failed_attempts=0,
        failed_login_attempts=0,
    )
    collector = User(
        username="specimen_collector",
        email="collector@clms.local",
        password_hash=password_hash.hash("Collector123!"),
        role="specimen_collector",
        is_locked=False,
        failed_attempts=0,
        failed_login_attempts=0,
    )
    technician = User(
        username="lab_technician",
        email="tech@clms.local",
        password_hash=password_hash.hash("Tech123!"),
        role="technician",
        is_locked=False,
        failed_attempts=0,
        failed_login_attempts=0,
    )
    locked = User(
        username="locked_user",
        email="locked@clms.local",
        password_hash=password_hash.hash("Locked123!"),
        role="technician",
        is_locked=True,
        failed_attempts=5,
        failed_login_attempts=5,
    )
    db.add_all([manager, collector, technician, locked])
    db.commit()

    # Seed patients
    p1 = Patient(
        name="Eleanor Vance",
        dob="1984-03-22",
        address="742 Evergreen Terrace, Springfield, OR 97477",
        phone="(555) 382-9104",
        email="eleanor.vance@example.com",
        insurance_provider="Blue Cross Blue Shield",
        policy_number="BCBS-89310482",
    )
    p2 = Patient(
        name="Marcus Aurelius Vance",
        dob="1968-11-09",
        address="108 Ocean Drive, Miami, FL 33139",
        phone="(305) 555-8291",
        email="m.aurelius@example.com",
        insurance_provider="United Healthcare",
        policy_number="UHC-992014-A",
    )
    p3 = Patient(
        name="Sophia Lin",
        dob="1995-07-14",
        address="420 University Blvd, Tucson, AZ 85721",
        phone="(520) 621-2211",
        email="sophia.lin@example.com",
        insurance_provider="Aetna Health Plan",
        policy_number="AET-401928-01",
    )
    p4 = Patient(
        name="Arthur Dent",
        dob="1978-04-01",
        address="15 Country Lane, Cottington, UK",
        phone="(555) 424-2424",
        email="arthur.dent@example.com",
        insurance_provider="Cigna Global",
        policy_number="CG-42424242",
    )
    db.add_all([p1, p2, p3, p4])
    db.commit()

    # Add tests for p1 and p2 (so deletion is blocked)
    # p3 and p4 have NO tests (can be safely deleted)
    t1 = LabTest(patient_id=p1.id, test_name="Complete Blood Count (CBC)", status="completed")
    t2 = LabTest(patient_id=p1.id, test_name="Comprehensive Metabolic Panel", status="pending")
    t3 = LabTest(patient_id=p2.id, test_name="Lipid Panel with Triglycerides", status="in_progress")
    db.add_all([t1, t2, t3])
    db.commit()

    print("Seed complete! Users and patients created successfully.")
    db.close()

if __name__ == "__main__":
    seed()
