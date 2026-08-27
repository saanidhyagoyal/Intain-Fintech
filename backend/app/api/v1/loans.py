"""
Loan endpoints – GET /api/loans, GET /api/loans/:id
Returns projected current state computed from Event Sourcing.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.exception import ExceptionRecord
from app.schemas.loan import LoanDetailResponse, LoanListResponse, LoanState
from app.services.event_store import (
    get_all_loan_ids,
    get_events_for_loan,
    project_loan_state,
)

router = APIRouter()


@router.get("/loans", response_model=LoanListResponse)
async def list_loans(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    List all loans with their projected current state.
    Each loan's state is computed by replaying its event history.
    """
    all_ids = get_all_loan_ids(db)
    total = len(all_ids)

    # Paginate
    start = (page - 1) * page_size
    end = start + page_size
    page_ids = all_ids[start:end]

    loans = []
    for loan_id in page_ids:
        state = project_loan_state(db, loan_id)
        if state:
            loans.append(LoanState(**state))

    return LoanListResponse(
        loans=loans,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/loans/{loan_id}", response_model=LoanDetailResponse)
async def get_loan(
    loan_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Get a single loan's projected state with its full event history
    and any associated exceptions.
    """
    state = project_loan_state(db, loan_id)
    if not state:
        raise HTTPException(status_code=404, detail=f"Loan {loan_id} not found")

    # Get events
    events = get_events_for_loan(db, loan_id)
    import json
    event_dicts = [
        {
            "id": e.id,
            "event_type": e.event_type,
            "payload": json.loads(e.payload_json),
            "timestamp": e.timestamp.isoformat(),
            "user_id": e.user_id,
            "event_hash": e.event_hash,
            "source_file": e.source_file,
            "source_line": e.source_line,
        }
        for e in events
    ]

    # Get exceptions
    exceptions = (
        db.query(ExceptionRecord)
        .filter(ExceptionRecord.loan_id == loan_id)
        .all()
    )
    exc_dicts = [
        {
            "id": exc.id,
            "rule_id": exc.rule_id,
            "field_name": exc.field_name,
            "expected_value": exc.expected_value,
            "actual_value": exc.actual_value,
            "description": exc.description,
            "severity": exc.severity,
            "status": exc.status,
            "created_at": exc.created_at.isoformat() if exc.created_at else None,
        }
        for exc in exceptions
    ]

    return LoanDetailResponse(
        loan=LoanState(**state),
        events=event_dicts,
        exceptions=exc_dicts,
    )
