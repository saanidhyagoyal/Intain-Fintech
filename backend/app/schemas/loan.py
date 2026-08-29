"""
Pydantic schemas for loan data – matching the exact 21-field schema from PDF Section 6.

These schemas serve as:
  - API response models (LoanState, LoanListResponse)
  - Validation contracts for ingested CSV data
  - The canonical record structure for verified loans
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── The 21-field canonical loan schema ────────────────────────
class LoanFields(BaseModel):
    """Exact field schema from PDF Section 6."""

    loan_id: Optional[str] = None
    borrower_id: Optional[str] = None
    loan_type: Optional[str] = None
    origination_date: Optional[str] = None
    maturity_date: Optional[str] = None
    original_principal: Optional[float] = None
    current_balance: Optional[float] = None
    interest_rate: Optional[float] = None
    term_months: Optional[int] = None
    borrower_state: Optional[str] = None
    loan_purpose: Optional[str] = None
    credit_grade: Optional[str] = None
    employment_length: Optional[str] = None
    income_band: Optional[str] = None
    payment_status: Optional[str] = None
    days_past_due: Optional[int] = None
    servicer_name: Optional[str] = None
    last_payment_date: Optional[str] = None
    last_updated_at: Optional[str] = None
    document_status: Optional[str] = None
    source_system: Optional[str] = None


class LoanState(LoanFields):
    """
    Projected current state of a loan, computed by replaying events.
    Extends the base fields with metadata about the projection.
    """

    event_count: int = 0
    last_event_type: Optional[str] = None
    last_event_at: Optional[datetime] = None
    has_exceptions: bool = False
    is_verified: bool = False
    record_hash: Optional[str] = None

    model_config = {"from_attributes": True}


class LoanListResponse(BaseModel):
    """Paginated loan list for GET /api/loans."""

    loans: list[LoanState]
    total: int
    page: int = 1
    page_size: int = 50


class LoanDetailResponse(BaseModel):
    """Single loan detail for GET /api/loans/:id."""

    loan: LoanState
    events: list[dict] = Field(default_factory=list)
    exceptions: list[dict] = Field(default_factory=list)


class VerifiedLoanResponse(BaseModel):
    """Verified loan with cryptographic proof."""

    loan: LoanState
    record_hash: str
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    hash_chain_valid: bool = True


class VerifiedLoanListResponse(BaseModel):
    """Paginated verified loan list for GET /api/verified-loans."""

    loans: list[VerifiedLoanResponse]
    total: int
    page: int = 1
    page_size: int = 50


class IngestionResult(BaseModel):
    """Result of CSV upload and ingestion."""

    filename: str
    total_rows: int
    imported_count: int
    failed_count: int
    failed_rows: list[dict] = Field(default_factory=list)
    validation_exceptions: int = 0
    conflicts_detected: int = 0
    source_type: str = "loan_tape"  # or "servicer_update", "document_manifest"
    skipped_reason: Optional[str] = None
