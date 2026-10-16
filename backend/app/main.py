from fastapi import FastAPI
from sqlalchemy import text
from app.database import engine, Base
from app import models  # noqa: F401 - registers User and Patient so create_all knows about them
from fastapi.middleware.cors import CORSMiddleware

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# Create any missing tables (users, patients) when the app starts
Base.metadata.create_all(bind=engine)

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

from app.routers import auth
app.include_router(auth.router)


from app.routers import patients
app.include_router(patients.router)