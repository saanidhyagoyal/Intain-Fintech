"""
Pydantic schemas for audit trail, event sourcing, and time-travel.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class EventResponse(BaseModel):
    """A single event in the audit trail."""

    id: int
    loan_id: str
    event_type: str
    payload: dict
    timestamp: datetime
    user_id: Optional[int] = None
    username: Optional[str] = None
    event_hash: str
    source_file: Optional[str] = None
    source_line: Optional[int] = None

    model_config = {"from_attributes": True}


class AuditTrailResponse(BaseModel):
    """Full audit trail for a loan (GET /api/audit/:loanId)."""

    loan_id: str
    events: list[EventResponse]
    total_events: int
    hash_chain_valid: bool


class RewindRequest(BaseModel):
    """Request to rebuild loan state at a specific timestamp."""

    loan_id: str
    target_timestamp: datetime = Field(
        description="Rebuild the loan state as of this point in time"
    )


class RewindResponse(BaseModel):
    """Response for POST /api/audit/rewind – the time-traveled state."""

    loan_id: str
    target_timestamp: datetime
    projected_state: dict
    events_replayed: int
    events_skipped: int
    state_hash: str


class SummaryResponse(BaseModel):
    """Dashboard aggregates for GET /api/summary."""

    total_loans: int = 0
    total_events: int = 0
    total_exceptions: int = 0
    exceptions_by_severity: dict = Field(
        default_factory=lambda: {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    )
    exceptions_by_status: dict = Field(
        default_factory=lambda: {"OPEN": 0, "IN_REVIEW": 0, "RESOLVED": 0}
    )
    verified_loans: int = 0
    resolution_rate: float = 0.0
    ai_suggestions_generated: int = 0
    ai_suggestions_accepted: int = 0
    self_healing_rules: int = 0
    recent_uploads: list[dict] = Field(default_factory=list)
    data_quality_score: float = 0.0
    clean_rows: int = 0                      # loans with zero open exceptions
    loans_with_open_exceptions: int = 0      # distinct loan_ids with ≥1 open exception
