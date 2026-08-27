"""
Dashboard Summary endpoint.
GET /api/summary – aggregated stats for all three dashboard views.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.event import EventType, LoanEvent
from app.models.exception import ExceptionRecord, ExceptionStatus, Severity
from app.models.rule import RuleType, ValidationRule
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

    # Total exceptions
    total_exceptions = db.query(func.count(ExceptionRecord.id)).scalar() or 0

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

    # Resolution rate
    resolved = exceptions_by_status.get("RESOLVED", 0)
    resolution_rate = (resolved / total_exceptions * 100) if total_exceptions > 0 else 0.0

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
        .filter(ValidationRule.rule_type == RuleType.AI_GENERATED)
        .scalar() or 0
    )

    # Recent uploads (last 10 LOAN_IMPORTED events grouped by source_file)
    recent_uploads_query = (
        db.query(
            LoanEvent.source_file,
            func.count(LoanEvent.id).label("count"),
            func.max(LoanEvent.timestamp).label("last_upload"),
        )
        .filter(
            LoanEvent.event_type == EventType.LOAN_IMPORTED,
            LoanEvent.source_file.isnot(None),
        )
        .group_by(LoanEvent.source_file)
        .order_by(func.max(LoanEvent.timestamp).desc())
        .limit(10)
        .all()
    )
    recent_uploads = [
        {
            "filename": r[0],
            "records": r[1],
            "uploaded_at": r[2].isoformat() if r[2] else None,
        }
        for r in recent_uploads_query
    ]

    # Data quality score (% of loans without unresolved exceptions)
    loans_with_open_exceptions = (
        db.query(func.count(func.distinct(ExceptionRecord.loan_id)))
        .filter(ExceptionRecord.status != ExceptionStatus.RESOLVED)
        .scalar() or 0
    )
    data_quality_score = (
        ((total_loans - loans_with_open_exceptions) / total_loans * 100)
        if total_loans > 0
        else 100.0
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
    )
