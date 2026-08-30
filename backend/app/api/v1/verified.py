"""
Verified Records endpoints.
GET  /api/verified-loans           – list verified loans
GET  /api/verified-loans/:id       – single verified loan with hash
GET  /api/verified-loans/export    – CSV export of verified dataset
POST /api/loans/:id/verify         – mark a loan as verified
"""

import csv
import io
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.cryptography import compute_record_hash
from app.core.database import get_db
from app.core.security import UserRole, get_current_user, require_role
from app.models.event import EventType, LoanEvent
from app.schemas.loan import LoanState, VerifiedLoanListResponse, VerifiedLoanResponse
from app.services.event_store import (
    LOAN_FIELDS,
    append_event,
    get_all_loan_ids,
    get_events_for_loan,
    project_loan_state,
    verify_hash_chain,
)

router = APIRouter()


@router.get("/verified-loans", response_model=VerifiedLoanListResponse)
async def list_verified_loans(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all loans that have been verified."""
    # Find all loan IDs that have a LOAN_VERIFIED event
    verified_ids = (
        db.query(LoanEvent.loan_id)
        .filter(LoanEvent.event_type == EventType.LOAN_VERIFIED)
        .distinct()
        .all()
    )
    verified_loan_ids = [v[0] for v in verified_ids]
    total = len(verified_loan_ids)

    # Paginate
    start = (page - 1) * page_size
    end = start + page_size
    page_ids = verified_loan_ids[start:end]

    loans = []
    for loan_id in page_ids:
        state = project_loan_state(db, loan_id)
        if state:
            # Get verification details from the LOAN_VERIFIED event
            verify_event = (
                db.query(LoanEvent)
                .filter(
                    LoanEvent.loan_id == loan_id,
                    LoanEvent.event_type == EventType.LOAN_VERIFIED,
                )
                .order_by(LoanEvent.timestamp.desc())
                .first()
            )

            verified_by = None
            verified_at = None
            if verify_event:
                payload = json.loads(verify_event.payload_json)
                verified_by = payload.get("verified_by")
                verified_at = verify_event.timestamp

            record_hash = compute_record_hash(
                {k: v for k, v in state.items() if k in LOAN_FIELDS}
            )
            hash_chain_valid = verify_hash_chain(db, loan_id)

            loans.append(
                VerifiedLoanResponse(
                    loan=LoanState(**state),
                    record_hash=record_hash,
                    verified_by=verified_by,
                    verified_at=verified_at,
                    hash_chain_valid=hash_chain_valid,
                )
            )

    return VerifiedLoanListResponse(
        loans=loans,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/verified-loans/export")
async def export_verified_loans(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Export all verified loans as a CSV file.
    Includes the record hash and audit trail summary.
    """
    verified_ids = (
        db.query(LoanEvent.loan_id)
        .filter(LoanEvent.event_type == EventType.LOAN_VERIFIED)
        .distinct()
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    header = LOAN_FIELDS + ["record_hash", "verified_at", "verified_by", "event_count", "hash_chain_valid"]
    writer.writerow(header)

    for (loan_id,) in verified_ids:
        state = project_loan_state(db, loan_id)
        if not state:
            continue

        record_hash = compute_record_hash(
            {k: v for k, v in state.items() if k in LOAN_FIELDS}
        )
        hash_chain_valid = verify_hash_chain(db, loan_id)

        # Get verification details
        verify_event = (
            db.query(LoanEvent)
            .filter(
                LoanEvent.loan_id == loan_id,
                LoanEvent.event_type == EventType.LOAN_VERIFIED,
            )
            .order_by(LoanEvent.timestamp.desc())
            .first()
        )

        verified_at = verify_event.timestamp.isoformat() if verify_event else ""
        verified_by = ""
        if verify_event:
            payload = json.loads(verify_event.payload_json)
            verified_by = payload.get("verified_by", "")

        row = [state.get(f, "") for f in LOAN_FIELDS]
        row.extend([record_hash, verified_at, verified_by, state.get("event_count", 0), hash_chain_valid])
        writer.writerow(row)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=verified_loans_export.csv"},
    )


@router.get("/verified-loans/{loan_id}", response_model=VerifiedLoanResponse)
async def get_verified_loan(
    loan_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get a single verified loan with its cryptographic proof."""
    state = project_loan_state(db, loan_id)
    if not state:
        raise HTTPException(status_code=404, detail=f"Loan {loan_id} not found")

    if not state.get("is_verified"):
        raise HTTPException(status_code=404, detail=f"Loan {loan_id} is not verified")

    verify_event = (
        db.query(LoanEvent)
        .filter(
            LoanEvent.loan_id == loan_id,
            LoanEvent.event_type == EventType.LOAN_VERIFIED,
        )
        .order_by(LoanEvent.timestamp.desc())
        .first()
    )

    verified_by = None
    verified_at = None
    if verify_event:
        payload = json.loads(verify_event.payload_json)
        verified_by = payload.get("verified_by")
        verified_at = verify_event.timestamp

    record_hash = compute_record_hash(
        {k: v for k, v in state.items() if k in LOAN_FIELDS}
    )
    hash_chain_valid = verify_hash_chain(db, loan_id)

    return VerifiedLoanResponse(
        loan=LoanState(**state),
        record_hash=record_hash,
        verified_by=verified_by,
        verified_at=verified_at,
        hash_chain_valid=hash_chain_valid,
    )


@router.post(
    "/loans/{loan_id}/verify",
    response_model=VerifiedLoanResponse,
    dependencies=[Depends(require_role(UserRole.REVIEWER, UserRole.ADMIN))],
)
async def verify_loan(
    loan_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Mark a loan as verified. Creates a LOAN_VERIFIED event with a
    cryptographic hash of the canonical loan state.
    Only REVIEWER role can verify loans.
    """
    state = project_loan_state(db, loan_id)
    if not state:
        raise HTTPException(status_code=404, detail=f"Loan {loan_id} not found")

    # Check for unresolved exceptions
    from app.models.exception import ExceptionRecord, ExceptionStatus
    open_exceptions_query = (
        db.query(ExceptionRecord)
        .filter(
            ExceptionRecord.loan_id == loan_id,
            ExceptionRecord.status.in_([ExceptionStatus.OPEN, ExceptionStatus.IN_REVIEW]),
        )
    )
    open_exceptions_count = open_exceptions_query.count()
    if open_exceptions_count > 0:
        blocking_ids = [exc.id for exc in open_exceptions_query.all()]
        raise HTTPException(
            status_code=400,
            detail=f"Cannot verify loan. Unresolved exception IDs: {blocking_ids}",
        )

    # Compute canonical record hash
    canonical_data = {k: v for k, v in state.items() if k in LOAN_FIELDS}
    record_hash = compute_record_hash(canonical_data)

    # Emit verification event
    append_event(
        db=db,
        loan_id=loan_id,
        event_type=EventType.LOAN_VERIFIED,
        payload={
            "record_hash": record_hash,
            "verified_by": current_user["username"],
            "verified_at": datetime.now(timezone.utc).isoformat(),
            "canonical_state": canonical_data,
        },
        user_id=current_user["user_id"],
    )

    db.commit()

    # Re-project state after verification
    state = project_loan_state(db, loan_id)
    hash_chain_valid = verify_hash_chain(db, loan_id)

    return VerifiedLoanResponse(
        loan=LoanState(**state),
        record_hash=record_hash,
        verified_by=current_user["username"],
        verified_at=datetime.now(timezone.utc),
        hash_chain_valid=hash_chain_valid,
    )
