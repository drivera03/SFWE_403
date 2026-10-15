from fastapi import FastAPI
from sqlalchemy import text
from app.database import engine
from fastapi.middleware.cors import CORSMiddleware

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app = FastAPI()

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

from app.database import engine, Base
from app import models  # Ensures all models are registered with Base.metadata
from app.routers import auth, patients

# Auto-create tables if they don't exist
Base.metadata.create_all(bind=engine)

app.include_router(auth.router)
app.include_router(patients.router)