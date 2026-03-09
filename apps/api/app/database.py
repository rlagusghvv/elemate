from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

API_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = API_DIR / "data" / "elemate.db"
LEGACY_DB_PATH = API_DIR / "data" / "forgemate.db"


def _resolve_database_url() -> str:
    configured = os.getenv("DATABASE_URL")
    if configured:
        return configured
    if DEFAULT_DB_PATH.exists() or not LEGACY_DB_PATH.exists():
        return f"sqlite:///{DEFAULT_DB_PATH}"
    return f"sqlite:///{LEGACY_DB_PATH}"


DATABASE_URL = _resolve_database_url()

if DATABASE_URL.startswith("sqlite"):
    DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        future=True,
    )
else:
    engine = create_engine(DATABASE_URL, future=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
