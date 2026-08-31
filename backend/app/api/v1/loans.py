"""
Loan endpoints – GET /api/loans, GET /api/loans/:id, POST /api/loans/bulk-verify-clean
Returns projected current state computed from Event Sourcing.
"""

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.cryptography import compute_record_hash
from app.core.database import get_db
from app.core.security import UserRole, get_current_user, require_role
from app.models.event import EventType, LoanEvent
from app.models.exception import ExceptionRecord, ExceptionStatus
from app.schemas.loan import LoanDetailResponse, LoanListResponse, LoanState
from pydantic import BaseModel

class RevokeRequest(BaseModel):
    reason: str

class RejectRequest(BaseModel):
    reason: str

class ReturnLoanRequest(BaseModel):
    reason: str
from app.services.event_store import (
    LOAN_FIELDS,
    append_event,
    get_all_loan_ids,
    get_events_for_loan,
    project_loan_state,
)

router = APIRouter()
logger = logging.getLogger(__name__)


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


@router.post(
    "/loans/bulk-verify-clean",
    dependencies=[Depends(require_role(UserRole.REVIEWER))],
)
async def bulk_verify_clean_loans(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Fast-track: Bulk-verify all loans that have ZERO open/in-review exceptions
    and have NOT already been verified.

    This promotes clean loans directly to the verified ledger so they appear
    in the Consumer dashboard and CSV export.
    """
    # 1. Get all unique loan IDs
    all_loan_ids = set(get_all_loan_ids(db))

    # 2. Get loan IDs that have unresolved exceptions (OPEN or IN_REVIEW)
    loans_with_open_exceptions = set(
        row[0]
        for row in db.query(ExceptionRecord.loan_id)
        .filter(
            ExceptionRecord.status.in_([
                ExceptionStatus.OPEN,
                ExceptionStatus.IN_REVIEW,
            ])
        )
        .distinct()
        .all()
    )

    # 3. Get loan IDs that are already verified
    already_verified = set(
        row[0]
        for row in db.query(LoanEvent.loan_id)
        .filter(LoanEvent.event_type == EventType.LOAN_VERIFIED)
        .distinct()
        .all()
    )

    # 4. Clean loans = all loans - those with open exceptions - already verified
    clean_loan_ids = all_loan_ids - loans_with_open_exceptions - already_verified

    if not clean_loan_ids:
        return {
            "verified_count": 0,
            "message": "No clean unverified loans found. All loans either have unresolved exceptions or are already verified.",
        }

    # 5. Bulk verify each clean loan
    verified_count = 0
    now = datetime.now(timezone.utc)

    for loan_id in clean_loan_ids:
        try:
            state = project_loan_state(db, loan_id)
            if not state:
                continue

            canonical_data = {k: v for k, v in state.items() if k in LOAN_FIELDS}
            record_hash = compute_record_hash(canonical_data)

            append_event(
                db=db,
                loan_id=loan_id,
                event_type=EventType.LOAN_VERIFIED,
                payload={
                    "record_hash": record_hash,
                    "verified_by": current_user["username"],
                    "verified_at": now.isoformat(),
                    "canonical_state": canonical_data,
                    "bulk_verified": True,
                },
                user_id=current_user["user_id"],
            )
            verified_count += 1

            # Commit in batches of 500 for memory efficiency
            if verified_count % 500 == 0:
                db.commit()
                logger.info("Bulk verify progress: %d loans committed", verified_count)

        except Exception as e:
            logger.warning("Failed to verify loan %s: %s", loan_id, str(e))
            continue

    # Final commit for remaining loans
    db.commit()
    logger.info("✅ Bulk verify complete: %d clean loans verified", verified_count)

    return {
        "verified_count": verified_count,
        "message": f"Successfully verified {verified_count:,} clean loans.",
    }


@router.post(
    "/loans/{loan_id}/reject",
    dependencies=[Depends(require_role(UserRole.REVIEWER))],
)
async def reject_loan(
    loan_id: str,
    req: RejectRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Reject a loan, dropping it from the active pipeline."""
    state = project_loan_state(db, loan_id)
    if not state:
        raise HTTPException(status_code=404, detail=f"Loan {loan_id} not found")

    append_event(
        db=db,
        loan_id=loan_id,
        event_type=EventType.LOAN_REJECTED,
        payload={"reason": req.reason, "rejected_by": current_user["username"]},
        user_id=current_user["user_id"],
    )
    db.commit()
    return {"message": "Loan rejected"}


@router.post(
    "/loans/{loan_id}/return",
    dependencies=[Depends(require_role(UserRole.REVIEWER))],
)
async def return_loan(
    loan_id: str,
    req: ReturnLoanRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Return a loan for rework. Reopens all exceptions resolved by a Maker."""
    # Reopen all exceptions for this loan that are resolved
    exceptions = (
        db.query(ExceptionRecord)
        .filter(ExceptionRecord.loan_id == loan_id)
        .filter(ExceptionRecord.status == ExceptionStatus.RESOLVED)
        .all()
    )

    for exc in exceptions:
        exc.status = ExceptionStatus.OPEN
        exc.resolved_by = None
        exc.resolved_at = None
        exc.resolution_type = None
        exc.reviewer_comment = None

    append_event(
        db=db,
        loan_id=loan_id,
        event_type=EventType.EXCEPTION_RETURNED,
        payload={"reason": req.reason, "returned_by": current_user["username"], "bulk": True},
        user_id=current_user["user_id"],
    )
    db.commit()
    return {"message": "Loan returned for rework"}


@router.post(
    "/loans/{loan_id}/revoke",
    dependencies=[Depends(require_role(UserRole.REVIEWER))],
)
async def revoke_loan(
    loan_id: str,
    req: RevokeRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Revoke a previously verified loan."""
    state = project_loan_state(db, loan_id)
    if not state:
        raise HTTPException(status_code=404, detail=f"Loan {loan_id} not found")

    append_event(
        db=db,
        loan_id=loan_id,
        event_type=EventType.VERIFICATION_REVOKED,
        payload={"reason": req.reason, "revoked_by": current_user["username"]},
        user_id=current_user["user_id"],
    )
    db.commit()
    return {"message": "Loan verification revoked"}


@router.get("/loans/validate-hash/{hash_val}")
async def validate_hash(
    hash_val: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Validate a cryptographic hash to see its status on the ledger."""
    # 1. Check if it's a direct event_hash on the ledger
    event = db.query(LoanEvent).filter(LoanEvent.event_hash == hash_val).first()

    # 2. Check if it's a record_hash inside a LOAN_VERIFIED payload
    verify_event = (
        db.query(LoanEvent)
        .filter(LoanEvent.event_type == EventType.LOAN_VERIFIED)
        .filter(LoanEvent.payload_json.like(f'%"{hash_val}"%'))
        .first()
    )
    
    if not verify_event and not event:
        return {"status": "error", "message": "Hash not found on ledger."}
        
    if verify_event:
        loan_id = verify_event.loan_id
        
        # Check if there is a subsequent REVOKED event for this loan
        revoke_event = (
            db.query(LoanEvent)
            .filter(LoanEvent.loan_id == loan_id)
            .filter(LoanEvent.event_type == EventType.VERIFICATION_REVOKED)
            .order_by(LoanEvent.timestamp.desc())
            .first()
        )
        
        if revoke_event:
            payload = json.loads(revoke_event.payload_json)
            reason = payload.get("reason", "Unknown reason")
            return {"status": "revoked", "reason": reason}
            
    return {"status": "valid"}

