"""
Loan Data Verification Copilot — FastAPI Application Entry Point.

Starts the ASGI server, configures CORS, creates tables,
seeds default users, and mounts all API routers.
"""

import hashlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import UserRole
from app.models import ExceptionRecord, LoanEvent, User, ValidationRule  # noqa: F401
from app.api.router import api_router

settings = get_settings()
logger = logging.getLogger(__name__)


# ── Lifespan (startup / shutdown) ────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables and seed default users on startup."""
    if settings.RESET_DB_ON_STARTUP:
        Base.metadata.drop_all(bind=engine)
        logger.warning("🗑️ Database reset: all tables dropped (RESET_DB_ON_STARTUP=True)")
    Base.metadata.create_all(bind=engine)
    _seed_users()
    yield


def _seed_users():
    """Create default users for the four roles if they don't exist.
    Credentials are pulled from Settings (i.e. .env) – nothing is hardcoded."""
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            defaults = [
                User(
                    username=settings.SEED_ADMIN_USER,
                    email=f"{settings.SEED_ADMIN_USER}@intain.io",
                    hashed_password=hashlib.sha256(
                        settings.SEED_ADMIN_PASS.encode()
                    ).hexdigest(),
                    role=UserRole.ADMIN,
                ),
                User(
                    username=settings.SEED_OPERATOR_USER,
                    email=f"{settings.SEED_OPERATOR_USER}@intain.io",
                    hashed_password=hashlib.sha256(
                        settings.SEED_OPERATOR_PASS.encode()
                    ).hexdigest(),
                    role=UserRole.DATA_OPERATOR,
                ),
                User(
                    username=settings.SEED_REVIEWER_USER,
                    email=f"{settings.SEED_REVIEWER_USER}@intain.io",
                    hashed_password=hashlib.sha256(
                        settings.SEED_REVIEWER_PASS.encode()
                    ).hexdigest(),
                    role=UserRole.REVIEWER,
                ),
                User(
                    username=settings.REVIEWER_A_USERNAME,
                    email=f"{settings.REVIEWER_A_USERNAME}@intain.io",
                    hashed_password=hashlib.sha256(
                        settings.REVIEWER_A_PASSWORD.encode()
                    ).hexdigest(),
                    role=UserRole.REVIEWER,
                ),
                User(
                    username=settings.REVIEWER_B_USERNAME,
                    email=f"{settings.REVIEWER_B_USERNAME}@intain.io",
                    hashed_password=hashlib.sha256(
                        settings.REVIEWER_B_PASSWORD.encode()
                    ).hexdigest(),
                    role=UserRole.REVIEWER,
                ),
                User(
                    username=settings.SEED_CONSUMER_USER,
                    email=f"{settings.SEED_CONSUMER_USER}@intain.io",
                    hashed_password=hashlib.sha256(
                        settings.SEED_CONSUMER_PASS.encode()
                    ).hexdigest(),
                    role=UserRole.DATA_CONSUMER,
                ),
            ]
            db.add_all(defaults)
            db.commit()
            logger.info("✅ Seeded %d default users from .env", len(defaults))
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
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000", "*"],
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
