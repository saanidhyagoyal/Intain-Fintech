"""
Exception endpoints.
GET  /api/exceptions              – list with filters
PATCH /api/exceptions/:id/resolve – human resolves an exception
"""

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import UserRole, get_current_user, require_role
from app.models.event import EventType, LoanEvent
from app.models.exception import ExceptionRecord, ExceptionStatus, Severity
from app.schemas.exception import (
    ExceptionListResponse,
    ExceptionResolveRequest,
    ExceptionResponse,
)
from pydantic import BaseModel
from app.services.event_store import append_event, project_loan_state

router = APIRouter()


@router.get("/exceptions", response_model=ExceptionListResponse)
async def list_exceptions(
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    loan_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List exceptions with optional severity/status/loan_id filters."""
    query = db.query(ExceptionRecord)

    if severity:
        query = query.filter(ExceptionRecord.severity == severity.upper())
    if status:
        query = query.filter(ExceptionRecord.status == status.upper())
    if loan_id:
        query = query.filter(ExceptionRecord.loan_id == loan_id)

    # Filter out loans that are already verified or rejected
    excluded_loan_ids = db.query(LoanEvent.loan_id).filter(
        LoanEvent.event_type.in_([EventType.LOAN_VERIFIED, EventType.LOAN_REJECTED])
    ).subquery()
    
    query = query.filter(ExceptionRecord.loan_id.notin_(excluded_loan_ids))

    total = query.count()
    exceptions = (
        query.order_by(ExceptionRecord.loan_id.asc(), ExceptionRecord.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = []
    for exc in exceptions:
        ai_suggestion = None
        if exc.ai_suggestion_json:
            try:
                ai_suggestion = json.loads(exc.ai_suggestion_json)
            except json.JSONDecodeError:
                pass

        items.append(
            ExceptionResponse(
                id=exc.id,
                loan_id=exc.loan_id,
                rule_id=exc.rule_id,
                field_name=exc.field_name,
                expected_value=exc.expected_value,
                actual_value=exc.actual_value,
                description=exc.description,
                severity=exc.severity,
                status=exc.status,
                ai_suggestion=ai_suggestion,
                reviewer_comment=exc.reviewer_comment,
                resolved_by=exc.resolved_by,
                resolved_at=exc.resolved_at,
                resolution_type=exc.resolution_type,
                created_at=exc.created_at,
            )
        )

    return ExceptionListResponse(
        exceptions=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.patch(
    "/exceptions/{exception_id}/resolve",
    response_model=ExceptionResponse,
    dependencies=[Depends(require_role(UserRole.REVIEWER, UserRole.DATA_OPERATOR))],
)
async def resolve_exception(
    exception_id: int,
    req: ExceptionResolveRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Resolve an exception.
    - If apply_ai_suggestion=True: applies the stored AI patch
    - Otherwise: applies the manual_patch provided by the reviewer

    This is the ONLY way to apply data changes – enforcing the AI Sandbox.
    Emits HUMAN_EDIT_APPLIED or AI_SUGGESTION_APPLIED event.
    """
    exc = db.query(ExceptionRecord).filter(ExceptionRecord.id == exception_id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exception not found")

    if exc.status == ExceptionStatus.RESOLVED:
        raise HTTPException(status_code=400, detail="Exception already resolved")

    # Determine the patch to apply
    if req.apply_ai_suggestion:
        if not exc.ai_suggestion_json:
            raise HTTPException(
                status_code=400,
                detail="No AI suggestion available for this exception",
            )
        try:
            ai_data = json.loads(exc.ai_suggestion_json)
            patch = ai_data.get("suggested_patch", {})
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid AI suggestion data")

        event_type = EventType.AI_SUGGESTION_APPLIED
        resolution_type = "AI_ACCEPTED"
    elif req.manual_patch:
        patch = req.manual_patch
        event_type = EventType.HUMAN_EDIT_APPLIED
        resolution_type = "MANUAL_EDIT"
    else:
        # Dismiss without applying a patch
        patch = {}
        event_type = EventType.HUMAN_EDIT_APPLIED
        resolution_type = "DISMISSED"

    # Get old values for the self-healing pipeline to analyze
    current_state = project_loan_state(db, exc.loan_id)
    old_values = {k: current_state.get(k) for k in patch.keys()} if patch else {}

    # Emit the edit event (this is how data actually changes in Event Sourcing)
    if patch:
        append_event(
            db=db,
            loan_id=exc.loan_id,
            event_type=event_type,
            payload={
                "exception_id": exc.id,
                "patch": patch,
                "old_values": old_values,
                "reviewer_comment": req.reviewer_comment,
                "resolution_type": resolution_type,
            },
            user_id=current_user["user_id"],
        )

    # Update exception status explicitly
    exc.status = ExceptionStatus.RESOLVED
    exc.resolved_by = current_user["user_id"]
    exc.resolved_at = datetime.now(timezone.utc)
    exc.resolution_type = resolution_type
    exc.reviewer_comment = req.reviewer_comment

    # Emit the resolved event
    append_event(
        db=db,
        loan_id=exc.loan_id,
        event_type=EventType.EXCEPTION_RESOLVED,
        payload={
            "exception_id": exc.id,
            "resolution_type": resolution_type,
            "reviewer_comment": req.reviewer_comment,
        },
        user_id=current_user["user_id"],
    )

    db.commit()
    db.refresh(exc)

    ai_suggestion = None
    if exc.ai_suggestion_json:
        try:
            ai_suggestion = json.loads(exc.ai_suggestion_json)
        except json.JSONDecodeError:
            pass

    return ExceptionResponse(
        id=exc.id,
        loan_id=exc.loan_id,
        rule_id=exc.rule_id,
        field_name=exc.field_name,
        expected_value=exc.expected_value,
        actual_value=exc.actual_value,
        description=exc.description,
        severity=exc.severity,
        status=exc.status,
        ai_suggestion=ai_suggestion,
        reviewer_comment=exc.reviewer_comment,
        resolved_by=exc.resolved_by,
        resolved_at=exc.resolved_at,
        resolution_type=exc.resolution_type,
        created_at=exc.created_at,
    )


class ReworkRequest(BaseModel):
    reason: str

@router.patch(
    "/exceptions/{exception_id}/return",
    dependencies=[Depends(require_role(UserRole.REVIEWER, UserRole.ADMIN))],
)
async def return_exception(
    exception_id: int,
    req: ReworkRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Return a RESOLVED exception back to OPEN state for rework. Accepts JSON body."""
    exc = db.query(ExceptionRecord).filter(ExceptionRecord.id == exception_id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exception not found")
        
    if exc.status != ExceptionStatus.RESOLVED:
        raise HTTPException(status_code=400, detail="Only RESOLVED exceptions can be reopened")

    # Reset state explicitly to OPEN
    exc.status = ExceptionStatus.OPEN
    exc.resolved_by = None
    exc.resolved_at = None
    exc.resolution_type = None
    exc.reviewer_comment = None

    append_event(
        db=db,
        loan_id=exc.loan_id,
        event_type=EventType.EXCEPTION_RETURNED,
        payload={
            "exception_id": exc.id,
            "reason": req.reason
        },
        user_id=current_user["user_id"],
    )
    
    db.commit()
    return {"message": "Exception reopened successfully"}
