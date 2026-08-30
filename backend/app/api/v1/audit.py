"""
Audit & Time Travel endpoints.
GET  /api/audit/:loanId   – full event history for a loan
POST /api/audit/rewind    – rebuild loan state at a specific timestamp
"""

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.cryptography import compute_record_hash
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.audit import (
    AuditTrailResponse,
    EventResponse,
    RewindRequest,
    RewindResponse,
)
from app.services.event_store import (
    LOAN_FIELDS,
    get_events_for_loan,
    project_loan_state,
    verify_hash_chain,
)

router = APIRouter()


@router.get("/loans/{loan_id}", response_model=AuditTrailResponse)
async def get_audit_trail(
    loan_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Get the complete, immutable event history for a loan.
    Events are ordered chronologically and include hash chain validation.
    """
    events = get_events_for_loan(db, loan_id)

    if not events:
        raise HTTPException(
            status_code=404,
            detail=f"No events found for loan {loan_id}",
        )

    # Fetch usernames
    user_ids = {e.user_id for e in events if e.user_id}
    users = db.query(User).filter(User.id.in_(user_ids)).all() if user_ids else []
    username_map = {u.id: u.username for u in users}

    event_responses = []
    for e in events:
        try:
            payload = json.loads(e.payload_json)
        except json.JSONDecodeError:
            payload = {}

        event_responses.append(
            EventResponse(
                id=e.id,
                loan_id=e.loan_id,
                event_type=e.event_type,
                payload=payload,
                timestamp=e.timestamp,
                user_id=e.user_id,
                username=username_map.get(e.user_id) if e.user_id else None,
                event_hash=e.event_hash,
                source_file=e.source_file,
                source_line=e.source_line,
            )
        )

    hash_chain_valid = verify_hash_chain(db, loan_id)

    return AuditTrailResponse(
        loan_id=loan_id,
        events=event_responses,
        total_events=len(event_responses),
        hash_chain_valid=hash_chain_valid,
    )


@router.post("/rewind", response_model=RewindResponse)
async def rewind_loan_state(
    req: RewindRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    **Data Time Travel** – Rebuild a loan's state as of a specific timestamp.

    This re-projects the loan by replaying only events up to the given
    timestamp, proving instantaneous recovery from bad AI/human approvals.
    No data is modified – this is a read-only projection.
    """
    # Get total events for context
    all_events = get_events_for_loan(db, req.loan_id)
    if not all_events:
        raise HTTPException(
            status_code=404,
            detail=f"No events found for loan {req.loan_id}",
        )

    # Project state up to the target timestamp
    state = project_loan_state(db, req.loan_id, up_to=req.target_timestamp)

    if not state:
        raise HTTPException(
            status_code=404,
            detail=f"No events found for loan {req.loan_id} before {req.target_timestamp}",
        )

    # Count events replayed vs skipped
    events_replayed = sum(
        1 for e in all_events if e.timestamp <= req.target_timestamp
    )
    events_skipped = len(all_events) - events_replayed

    # Compute hash of the time-traveled state
    canonical = {k: v for k, v in state.items() if k in LOAN_FIELDS}
    state_hash = compute_record_hash(canonical)

    return RewindResponse(
        loan_id=req.loan_id,
        target_timestamp=req.target_timestamp,
        projected_state=state,
        events_replayed=events_replayed,
        events_skipped=events_skipped,
        state_hash=state_hash,
    )
