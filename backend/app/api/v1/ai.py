"""
AI Assistant endpoints.
POST /api/ai/explain/:id    – get AI explanation for an exception
POST /api/ai/suggest-rule   – trigger self-healing rule synthesis
"""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import UserRole, get_current_user, require_role
from app.models.exception import ExceptionRecord
from app.schemas.ai import AIExplainResponse, SuggestRuleRequest, SuggestRuleResponse
from app.services.ai_assistant import explain_exception
from app.services.event_store import project_loan_state
from app.services.self_healing import detect_recurring_patterns, synthesize_rule

router = APIRouter()


@router.post(
    "/explain/{exception_id}",
    response_model=AIExplainResponse,
    dependencies=[Depends(require_role(UserRole.REVIEWER, UserRole.DATA_OPERATOR, UserRole.ADMIN))],
)
async def ai_explain(
    exception_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Request an AI explanation for a validation exception.
    The AI analyzes the issue and suggests a JSON patch fix.

    AI SANDBOX: The suggestion is stored but NEVER auto-applied.
    A human must explicitly call PATCH /exceptions/:id/resolve to apply it.
    """
    exc = db.query(ExceptionRecord).filter(ExceptionRecord.id == exception_id).first()
    if not exc:
        raise HTTPException(status_code=404, detail="Exception not found")

    # Get current loan state for context
    loan_state = project_loan_state(db, exc.loan_id)

    exception_data = {
        "id": exc.id,
        "loan_id": exc.loan_id,
        "rule_id": exc.rule_id,
        "field_name": exc.field_name,
        "expected_value": exc.expected_value,
        "actual_value": exc.actual_value,
        "description": exc.description,
        "severity": exc.severity,
    }

    # Call AI (sandboxed – only generates suggestions)
    suggestion = await explain_exception(exception_data, loan_state)

    # Store the AI suggestion on the exception record (but DON'T apply it)
    exc.ai_suggestion_json = json.dumps(
        {
            "suggested_patch": suggestion.suggested_patch,
            "explanation": suggestion.explanation,
            "confidence": suggestion.confidence,
            "severity_assessment": suggestion.severity_assessment,
            "model_name": suggestion.model_name,
            "generated_at": suggestion.generated_at.isoformat(),
        },
        default=str,
    )
    db.commit()

    # Also emit an AI_PATCH_SUGGESTED event for the audit trail
    from app.services.event_store import append_event
    from app.models.event import EventType

    append_event(
        db=db,
        loan_id=exc.loan_id,
        event_type=EventType.AI_PATCH_SUGGESTED,
        payload={
            "exception_id": exc.id,
            "suggested_patch": suggestion.suggested_patch,
            "confidence": suggestion.confidence,
            "model_name": suggestion.model_name,
        },
        user_id=current_user["user_id"],
    )
    db.commit()

    return AIExplainResponse(
        exception_id=exc.id,
        explanation=suggestion.explanation,
        severity_assessment=suggestion.severity_assessment,
        suggestion=suggestion,
        model_name=suggestion.model_name,
        generated_at=suggestion.generated_at,
    )


@router.post(
    "/suggest-rule",
    response_model=SuggestRuleResponse,
    dependencies=[Depends(require_role(UserRole.REVIEWER, UserRole.DATA_OPERATOR, UserRole.ADMIN))],
)
async def ai_suggest_rule(
    req: SuggestRuleRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Self-Healing Pipeline: Detect recurring manual corrections and
    synthesize new automated validation rules.

    Scans HUMAN_EDIT_APPLIED events for repeated patterns (default: 3+ occurrences).
    Calls AI to generate a new validation/transformation rule.
    """
    # Detect patterns
    patterns = detect_recurring_patterns(
        db,
        field_name=req.field_name,
        min_occurrences=req.min_occurrences,
    )

    if not patterns:
        raise HTTPException(
            status_code=404,
            detail=f"No recurring correction patterns found "
            f"(minimum {req.min_occurrences} occurrences required). "
            "More manual corrections are needed before the self-healing pipeline can activate.",
        )

    # Synthesize a rule from the top pattern
    pattern = patterns[0]
    rule = await synthesize_rule(db, pattern, current_user["user_id"])
    db.commit()

    if not rule:
        raise HTTPException(
            status_code=500,
            detail="Failed to synthesize a rule from the detected pattern",
        )

    return SuggestRuleResponse(
        rule_name=rule.rule_name,
        field_name=rule.field_name,
        condition_json=json.loads(rule.condition_json) if rule.condition_json else None,
        transformation_json=json.loads(rule.transformation_json) if rule.transformation_json else None,
        error_message=rule.error_message or "",
        severity=rule.severity,
        source_pattern=pattern,
        model_name=rule.ai_model or "unknown",
        prompt_used=rule.ai_prompt or "",
        generated_at=rule.created_at or datetime.now(timezone.utc),
        auto_activated=rule.is_active,
    )
