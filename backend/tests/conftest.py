"""
Pytest fixtures for Intain Copilot backend tests.

Uses an in-memory SQLite database with StaticPool so all connections
share the same underlying database (required for in-memory SQLite).
"""

import hashlib
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import UserRole
from app.models.user import User


@pytest.fixture(scope="function")
def db_engine():
    """Create a fresh in-memory SQLite engine with StaticPool."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db_session(db_engine):
    """Yield a clean database session seeded with test users."""
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    session = TestSession()

    # Seed default test users (only if not already seeded by lifespan)
    existing = session.query(User).count()
    if existing == 0:
        users = [
            User(
                username="admin",
                email="admin@test.io",
                hashed_password=hashlib.sha256(b"admin123").hexdigest(),
                role=UserRole.REVIEWER,
            ),
            User(
                username="operator",
                email="operator@test.io",
                hashed_password=hashlib.sha256(b"operator123").hexdigest(),
                role=UserRole.DATA_OPERATOR,
            ),
            User(
                username="reviewer",
                email="reviewer@test.io",
                hashed_password=hashlib.sha256(b"reviewer123").hexdigest(),
                role=UserRole.REVIEWER,
            ),
            User(
                username="consumer",
                email="consumer@test.io",
                hashed_password=hashlib.sha256(b"consumer123").hexdigest(),
                role=UserRole.DATA_CONSUMER,
            ),
        ]
        session.add_all(users)
        session.commit()

    yield session
    session.close()


@pytest.fixture(scope="function")
def test_app(db_engine, db_session):
    """
    FastAPI TestClient with dependency-overridden DB session.

    Patches the database module so the app lifespan, SessionLocal,
    and all Depends(get_db) calls use our shared in-memory engine.
    """
    from fastapi.testclient import TestClient
    from main import app
    import app.core.database as db_module

    # Save originals
    original_engine = db_module.engine
    original_session_local = db_module.SessionLocal

    # Patch database module globals
    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    db_module.engine = db_engine
    db_module.SessionLocal = TestSessionLocal

    def _override_get_db():
        session = TestSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_get_db

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()
    db_module.engine = original_engine
    db_module.SessionLocal = original_session_local
