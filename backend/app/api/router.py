"""
Aggregates all v1 API routers into a single router for main.py to mount.
"""

from fastapi import APIRouter

from app.api.v1 import upload, loans, exceptions, verified, audit, ai, summary, auth, rules

api_router = APIRouter()

# ── Auth ──────────────────────────────────────────────────────
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])

# ── Ingestion ─────────────────────────────────────────────────
api_router.include_router(upload.router, prefix="/ingest", tags=["Ingestion"])

# ── Loans ─────────────────────────────────────────────────────
api_router.include_router(loans.router, tags=["Loans"])

# ── Exceptions ────────────────────────────────────────────────
api_router.include_router(exceptions.router, tags=["Exceptions"])

# ── Verified Records ─────────────────────────────────────────
api_router.include_router(verified.router, tags=["Verified Records"])

# ── Audit / Time Travel ──────────────────────────────────────
api_router.include_router(audit.router, prefix="/audit", tags=["Audit & Time Travel"])

# ── AI Assistant ──────────────────────────────────────────────
api_router.include_router(ai.router, prefix="/ai", tags=["AI Assistant"])

# ── Dashboard Summary ────────────────────────────────────────
api_router.include_router(summary.router, tags=["Dashboard"])

# ── HITL Rules Engine ────────────────────────────────────────
api_router.include_router(rules.router)
