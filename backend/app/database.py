"""
Database setup — SQLite via SQLAlchemy.
Auto-creates the DB file on first run.
"""
import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import get_database_config


class Base(DeclarativeBase):
    pass


def get_db_path() -> str:
    config = get_database_config()
    db_path = Path(__file__).resolve().parent.parent / config["sqlite_path"]
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return str(db_path)


engine = create_engine(
    f"sqlite:///{get_db_path()}",
    connect_args={"check_same_thread": False},
    echo=get_database_config().get("echo", False),
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependency injection for FastAPI routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables."""
    from app import models  # noqa: F401 — import so Base sees the models
    Base.metadata.create_all(bind=engine)
