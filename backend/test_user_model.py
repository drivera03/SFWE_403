import os
os.environ["DATABASE_URL"] = "sqlite://"  # temporary in-memory database

from app.database import Base, engine, SessionLocal
from app.models import User

# create the users table
Base.metadata.create_all(engine)

# add a user
db = SessionLocal()
db.add(User(email="tech@example.com", password_hash="fakehash", role="technician"))
db.commit()

# read it back
user = db.query(User).filter_by(email="tech@example.com").first()
print(user.id, user.email, user.role, user.failed_login_attempts, user.locked_until)
db.close()