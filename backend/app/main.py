from fastapi import FastAPI
from sqlalchemy import text
from app.database import engine

app = FastAPI()

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/db-check")
def db_check():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"database": "connected"}