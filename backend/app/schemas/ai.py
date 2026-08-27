"""
Pydantic schemas for AI assistant responses and self-healing rules.
Enforces the AI Sandbox constraint: every suggestion includes full model metadata.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AISuggestion(BaseModel):
    """
    A sandboxed AI suggestion – never auto-applied to loan data.
    Includes full provenance: model name, prompt used, timestamp.
    """

    exception_id: int
    loan_id: str
    suggested_patch: dict = Field(
        description="JSON patch to fix the data quality issue, e.g. {'current_balance': 150000.00}"
    )
    explanation: str = Field(
        description="Human-readable explanation of why this fix is suggested"
    )
    confidence: float = Field(
        ge=0.0, le=1.0,
        description="Model's confidence in the suggestion (0.0 to 1.0)"
    )
    severity_assessment: str = Field(
        description="AI's assessment of issue severity: CRITICAL, HIGH, MEDIUM, LOW"
    )

    # ── Model metadata (Section 9 requirement) ───────────────
    model_name: str = Field(description="LLM model used, e.g. 'gemini-2.0-flash'")
    prompt_used: str = Field(description="The full prompt sent to the model")
    generated_at: datetime = Field(description="Timestamp of generation")
    tokens_used: Optional[int] = None


class AIExplainResponse(BaseModel):
    """Response for POST /api/ai/explain/:id."""

    exception_id: int
    explanation: str
    severity_assessment: str
    suggestion: Optional[AISuggestion] = None
    model_name: str
    generated_at: datetime


class SuggestRuleRequest(BaseModel):
    """Request for POST /api/ai/suggest-rule (self-healing trigger)."""

    field_name: Optional[str] = None
    min_occurrences: int = Field(
        default=3,
        description="Minimum number of identical human edits to trigger rule synthesis",
    )


class SuggestRuleResponse(BaseModel):
    """Response for POST /api/ai/suggest-rule."""

    rule_name: str
    field_name: str
    condition_json: Optional[dict] = None
    transformation_json: Optional[dict] = None
    error_message: str
    severity: str
    source_pattern: dict = Field(
        description="The recurring edit pattern that triggered this rule"
    )
    model_name: str
    prompt_used: str
    generated_at: datetime
    auto_activated: bool = False
