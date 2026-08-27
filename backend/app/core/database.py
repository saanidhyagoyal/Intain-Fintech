"""
SQLAlchemy engine, session factory, and declarative Base.
Supports SQLite (dev) and PostgreSQL/MySQL (prod) via DATABASE_URL.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import get_settings

settings = get_settings()

# ── Engine ────────────────────────────────────────────────────
# SQLite needs check_same_thread=False for FastAPI's async context
_connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=_connect_args,
    echo=settings.DEBUG,
    pool_pre_ping=True,
)

# ── Session ───────────────────────────────────────────────────
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ── Declarative Base ──────────────────────────────────────────
class Base(DeclarativeBase):
    """All ORM models inherit from this."""
    pass


# ── Dependency ────────────────────────────────────────────────
def get_db():
    """FastAPI dependency that yields a DB session and closes it after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
