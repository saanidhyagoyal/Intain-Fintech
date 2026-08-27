"""
Pydantic schemas for exception records and resolution workflows.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ExceptionResponse(BaseModel):
    """API response for a single exception record."""

    id: int
    loan_id: str
    rule_id: str
    field_name: str
    expected_value: Optional[str] = None
    actual_value: Optional[str] = None
    description: Optional[str] = None
    severity: str
    status: str
    ai_suggestion: Optional[dict] = None
    reviewer_comment: Optional[str] = None
    resolved_by: Optional[int] = None
    resolved_at: Optional[datetime] = None
    resolution_type: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExceptionListResponse(BaseModel):
    """Paginated exception list for GET /api/exceptions."""

    exceptions: list[ExceptionResponse]
    total: int
    page: int = 1
    page_size: int = 50


class ExceptionResolveRequest(BaseModel):
    """
    Request to resolve an exception.
    If apply_ai_suggestion is True, the stored AI patch is applied.
    Otherwise, manual_patch is used.
    """

    apply_ai_suggestion: bool = False
    manual_patch: Optional[dict] = Field(
        default=None,
        description="Manual field corrections, e.g. {'current_balance': 150000.00}",
    )
    reviewer_comment: Optional[str] = None


class ExceptionFilterParams(BaseModel):
    """Query parameters for filtering exceptions."""

    severity: Optional[str] = None
    status: Optional[str] = None
    loan_id: Optional[str] = None
    field_name: Optional[str] = None
    page: int = 1
    page_size: int = 50
