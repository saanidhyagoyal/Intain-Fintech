"""
Dashboard Summary endpoint.
GET /api/summary – aggregated stats for all three dashboard views.
"""

from datetime import timezone
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.event import EventType, LoanEvent
from app.models.exception import ExceptionRecord, ExceptionStatus
from app.models.rule import RuleSource, ValidationRule
from app.schemas.audit import SummaryResponse

router = APIRouter()


@router.get("/summary", response_model=SummaryResponse)
async def get_summary(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Dashboard summary with aggregated statistics.
    Supports Data Operator, Reviewer, and Data Consumer views.
    """
    # Total unique loans
    total_loans = (
        db.query(func.count(func.distinct(LoanEvent.loan_id)))
        .filter(LoanEvent.loan_id != "SYSTEM")
        .scalar() or 0
    )

    # Total events
    total_events = db.query(func.count(LoanEvent.id)).scalar() or 0

    # Total exceptions (only OPEN or IN_REVIEW)
    total_exceptions = (
        db.query(func.count(ExceptionRecord.id))
        .filter(ExceptionRecord.status.in_([ExceptionStatus.OPEN, ExceptionStatus.IN_REVIEW]))
        .scalar() or 0
    )

    # Exceptions by severity
    severity_counts = (
        db.query(ExceptionRecord.severity, func.count(ExceptionRecord.id))
        .group_by(ExceptionRecord.severity)
        .all()
    )
    exceptions_by_severity = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for sev, count in severity_counts:
        exceptions_by_severity[sev] = count

    # Exceptions by status
    status_counts = (
        db.query(ExceptionRecord.status, func.count(ExceptionRecord.id))
        .group_by(ExceptionRecord.status)
        .all()
    )
    exceptions_by_status = {"OPEN": 0, "IN_REVIEW": 0, "RESOLVED": 0}
    for st, count in status_counts:
        exceptions_by_status[st] = count

    # Verified loans
    verified_loans = (
        db.query(func.count(func.distinct(LoanEvent.loan_id)))
        .filter(LoanEvent.event_type == EventType.LOAN_VERIFIED)
        .scalar() or 0
    )

    # Resolution rate (guard against zero-division when DB is empty)
    resolved = exceptions_by_status.get("RESOLVED", 0)
    total_all_exceptions = resolved + total_exceptions
    resolution_rate = (resolved / total_all_exceptions * 100) if total_all_exceptions > 0 else 0.0

    # AI suggestions generated
    ai_suggestions = (
        db.query(func.count(LoanEvent.id))
        .filter(LoanEvent.event_type == EventType.AI_PATCH_SUGGESTED)
        .scalar() or 0
    )

    # AI suggestions accepted
    ai_accepted = (
        db.query(func.count(LoanEvent.id))
        .filter(LoanEvent.event_type == EventType.AI_SUGGESTION_APPLIED)
        .scalar() or 0
    )

    # Self-healing rules
    self_healing_rules = (
        db.query(func.count(ValidationRule.id))
        .filter(ValidationRule.source == RuleSource.AI_SUGGESTED)
        .scalar() or 0
    )

    # Recent uploads (query the FILE_UPLOADED events)
    file_events = (
        db.query(LoanEvent)
        .filter(LoanEvent.event_type == EventType.FILE_UPLOADED)
        .order_by(LoanEvent.timestamp.desc())
        .limit(10)
        .all()
    )
    
    import json
    recent_uploads = []
    for ev in file_events:
        try:
            payload = json.loads(ev.payload_json)
        except Exception:
            payload = {}
            
        recent_uploads.append({
            "filename": ev.source_file,
            "records": payload.get("total_rows", 0),
            "exceptions": payload.get("exceptions", 0),
            "uploaded_at": ev.timestamp.replace(tzinfo=timezone.utc).isoformat() if ev.timestamp else None,
        })

    # Data quality score (% of loans without unresolved exceptions)
    # Uses DISTINCT loan_id count – NOT raw exception count
    loans_with_open_exceptions = (
        db.query(func.count(func.distinct(ExceptionRecord.loan_id)))
        .filter(ExceptionRecord.status != ExceptionStatus.RESOLVED)
        .scalar() or 0
    )

    # Clean rows = loans with zero open/in_review exceptions
    clean_rows = max(0, total_loans - loans_with_open_exceptions)

    # Zero-division guard: when DB is empty (e.g., after RESET_DB_ON_STARTUP)
    data_quality_score = (
        (clean_rows / total_loans * 100) if total_loans > 0 else 100.0
    )

    return SummaryResponse(
        total_loans=total_loans,
        total_events=total_events,
        total_exceptions=total_exceptions,
        exceptions_by_severity=exceptions_by_severity,
        exceptions_by_status=exceptions_by_status,
        verified_loans=verified_loans,
        resolution_rate=round(resolution_rate, 1),
        ai_suggestions_generated=ai_suggestions,
        ai_suggestions_accepted=ai_accepted,
        self_healing_rules=self_healing_rules,
        recent_uploads=recent_uploads,
        data_quality_score=round(data_quality_score, 1),
        clean_rows=clean_rows,
        loans_with_open_exceptions=loans_with_open_exceptions,
    )

