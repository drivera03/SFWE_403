from fastapi import FastAPI
from sqlalchemy import text
from app.database import engine, Base
from fastapi.middleware.cors import CORSMiddleware
from app.seed import seed_demo_users
from contextlib import asynccontextmanager
from app.models import user
from app.routers import auth, patients, lab_tests, tests

def ensure_schema_columns():
    user_columns = [
        ("username", "VARCHAR(100)"),
        ("email", "VARCHAR(255)"),
        ("password_hash", "VARCHAR(255)"),
        ("role", "VARCHAR(50)"),
        ("is_locked", "BOOLEAN DEFAULT FALSE"),
        ("failed_attempts", "INTEGER DEFAULT 0"),
        ("failed_login_attempts", "INTEGER DEFAULT 0"),
        ("locked_until", "TIMESTAMP WITH TIME ZONE"),
    ]
    patient_columns = [
        ("name", "VARCHAR(200)"),
        ("dob", "VARCHAR(50)"),
        ("first_name", "VARCHAR(100)"),
        ("last_name", "VARCHAR(100)"),
        ("date_of_birth", "DATE"),
        ("sex", "VARCHAR(20)"),
        ("address", "VARCHAR(200)"),
        ("phone", "VARCHAR(50)"),
        ("email", "VARCHAR(255)"),
        ("insurance_provider", "VARCHAR(200)"),
        ("policy_number", "VARCHAR(100)"),
    ]

    with engine.connect() as conn:
        for col_name, col_type in user_columns:
            try:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
                conn.commit()
            except Exception:
                try:
                    conn.rollback()
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type};"))
                    conn.commit()
                except Exception:
                    conn.rollback()

        for col_name, col_type in patient_columns:
            try:
                conn.execute(text(f"ALTER TABLE patients ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
                conn.commit()
            except Exception:
                try:
                    conn.rollback()
                    conn.execute(text(f"ALTER TABLE patients ADD COLUMN {col_name} {col_type};"))
                    conn.commit()
                except Exception:
                    conn.rollback()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # seed the database with demo users if it doesn't exist yet
    Base.metadata.create_all(bind=engine)
    ensure_schema_columns()
    seed_demo_users()
    yield

app = FastAPI(lifespan=lifespan)


origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/db-check")
def db_check():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"database": "connected"}


app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(lab_tests.router)
app.include_router(tests.router)
