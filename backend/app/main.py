from fastapi import FastAPI
from sqlalchemy import text
from app.database import engine, Base
from fastapi.middleware.cors import CORSMiddleware
from app.seed import seed_demo_users
from contextlib import asynccontextmanager
from app.models import user
from app.routers import auth, patients, lab_tests

def ensure_patient_columns():
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);"))
            conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);"))
            conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS date_of_birth DATE;"))
            conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS sex VARCHAR(20);"))
            conn.commit()
    except Exception:
        pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    # seed the database with demo users if it doesn't exist yet
    Base.metadata.create_all(bind=engine)
    ensure_patient_columns()
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
