"""
Loan Data Verification Copilot — FastAPI Application Entry Point.

Starts the ASGI server, configures CORS, creates tables,
seeds default users, and mounts all API routers.
"""

import hashlib
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import UserRole
from app.models import ExceptionRecord, LoanEvent, User, ValidationRule  # noqa: F401
from app.api.router import api_router

settings = get_settings()


# ── Lifespan (startup / shutdown) ────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables and seed default users on startup."""
    Base.metadata.create_all(bind=engine)
    _seed_users()
    yield


def _seed_users():
    """Create default users for the three roles if they don't exist."""
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            defaults = [
                User(
                    username="admin",
                    email="admin@intain.io",
                    hashed_password=hashlib.sha256(b"admin123").hexdigest(),
                    role=UserRole.ADMIN,
                ),
                User(
                    username="operator",
                    email="operator@intain.io",
                    hashed_password=hashlib.sha256(b"operator123").hexdigest(),
                    role=UserRole.DATA_OPERATOR,
                ),
                User(
                    username="reviewer",
                    email="reviewer@intain.io",
                    hashed_password=hashlib.sha256(b"reviewer123").hexdigest(),
                    role=UserRole.REVIEWER,
                ),
                User(
                    username="consumer",
                    email="consumer@intain.io",
                    hashed_password=hashlib.sha256(b"consumer123").hexdigest(),
                    role=UserRole.DATA_CONSUMER,
                ),
            ]
            db.add_all(defaults)
            db.commit()
    finally:
        db.close()


# ── App factory ──────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "Enterprise-grade loan data verification platform with "
        "Event Sourcing, AI-assisted review, and self-healing validation."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS (allow frontend dev server) ─────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount routers ─────────────────────────────────────────────
app.include_router(api_router, prefix="/api")


@app.get("/", tags=["health"])
async def root():
    return {
        "app": settings.APP_NAME,
        "version": "1.0.0",
        "status": "operational",
        "docs": "/docs",
    }
