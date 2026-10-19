from fastapi import FastAPI
from sqlalchemy import text
from app.database import engine, Base
from fastapi.middleware.cors import CORSMiddleware
from app.seed import seed_demo_users
from contextlib import asynccontextmanager
from app import models  # Ensures all models are registered with Base.metadata
from app.routers import auth, patients

@asynccontextmanager
async def lifespan(app: FastAPI):
    # seed the database with demo users if it doesn't exist yet
    Base.metadata.create_all(bind=engine)
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
