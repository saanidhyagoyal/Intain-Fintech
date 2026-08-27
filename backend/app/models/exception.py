"""
ExceptionRecord – data quality issues flagged by the validation engine.

Tracks lifecycle: OPEN → IN_REVIEW → RESOLVED
Stores AI suggestion payloads separately (never auto-applied).
"""

from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Severity(str, PyEnum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class ExceptionStatus(str, PyEnum):
    OPEN = "OPEN"
    IN_REVIEW = "IN_REVIEW"
    RESOLVED = "RESOLVED"


class ExceptionRecord(Base):
    """
    Each row represents a single validation failure for a loan field.
    AI suggestions are stored as JSON but never auto-applied.
    """

    __tablename__ = "exception_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # ── Identity ─────────────────────────────────────────────
    loan_id: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True,
    )
    rule_id: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="Identifier of the validation rule that fired",
    )

    # ── Failure detail ───────────────────────────────────────
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    expected_value: Mapped[str] = mapped_column(
        String(500), nullable=True,
        comment="What the rule expected (e.g. 'positive number')",
    )
    actual_value: Mapped[str] = mapped_column(
        String(500), nullable=True,
        comment="The actual value found in the record",
    )
    description: Mapped[str] = mapped_column(
        Text, nullable=True,
        comment="Human-readable explanation of the issue",
    )

    # ── Classification ───────────────────────────────────────
    severity: Mapped[str] = mapped_column(
        Enum(Severity, native_enum=False, length=10),
        nullable=False,
        default=Severity.MEDIUM,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        Enum(ExceptionStatus, native_enum=False, length=15),
        nullable=False,
        default=ExceptionStatus.OPEN,
        index=True,
    )

    # ── AI suggestion (sandboxed – never auto-applied) ───────
    ai_suggestion_json: Mapped[str] = mapped_column(
        Text, nullable=True,
        comment="JSON: {suggested_patch, explanation, confidence, model_name, prompt_used, generated_at}",
    )

    # ── Resolution ───────────────────────────────────────────
    reviewer_comment: Mapped[str] = mapped_column(Text, nullable=True)
    resolved_by: Mapped[int] = mapped_column(Integer, nullable=True)
    resolved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    resolution_type: Mapped[str] = mapped_column(
        String(30), nullable=True,
        comment="'MANUAL_EDIT', 'AI_ACCEPTED', 'DISMISSED'",
    )

    # ── Timestamps ───────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return (
            f"<Exception {self.id}: {self.severity} {self.status} "
            f"loan={self.loan_id} field={self.field_name}>"
        )
