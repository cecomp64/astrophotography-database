from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import get_settings
import os

settings = get_settings()

# 1. Ensure we handle the connection args for SQLite
connect_args = {}
if settings.database_url.startswith("sqlite"):
    # check_same_thread=False is REQUIRED for SQLite in FastAPI/Uvicorn
    # because the engine is shared across multiple threads.
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.database_url, 
    connect_args=connect_args
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()