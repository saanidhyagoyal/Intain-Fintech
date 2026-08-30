"""
LoanEvent – the immutable event store.

This is the CORE of the Event Sourcing architecture.
No UPDATE/DELETE is ever performed on this table.
Every change to a loan record is stored as an append-only event.
The "current state" of any loan is computed by replaying its events.

Event types:
  LOAN_IMPORTED          – raw row ingested from CSV
  VALIDATION_FAILED      – a validation rule flagged an issue
  AI_PATCH_SUGGESTED     – LLM generated a fix suggestion
  HUMAN_EDIT_APPLIED     – reviewer manually corrected a field
  AI_SUGGESTION_APPLIED  – reviewer accepted an AI suggestion
  LOAN_VERIFIED          – loan marked as verified (canonical state)
  COMMENT_ADDED          – reviewer added a comment
  CONFLICT_DETECTED      – servicer_update.csv conflicted with loan_tape
  DOCUMENT_MISSING       – document_manifest cross-ref found missing doc
  RULE_GENERATED         – self-healing pipeline created a new rule
"""

from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EventType(str, PyEnum):
    LOAN_IMPORTED = "LOAN_IMPORTED"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    AI_PATCH_SUGGESTED = "AI_PATCH_SUGGESTED"
    HUMAN_EDIT_APPLIED = "HUMAN_EDIT_APPLIED"
    AI_SUGGESTION_APPLIED = "AI_SUGGESTION_APPLIED"
    LOAN_VERIFIED = "LOAN_VERIFIED"
    COMMENT_ADDED = "COMMENT_ADDED"
    CONFLICT_DETECTED = "CONFLICT_DETECTED"
    DOCUMENT_MISSING = "DOCUMENT_MISSING"
    RULE_GENERATED = "RULE_GENERATED"
    FILE_UPLOADED = "FILE_UPLOADED"
    EXCEPTION_RESOLVED = "EXCEPTION_RESOLVED"


class LoanEvent(Base):
    """
    Append-only event ledger.
    Each row represents a single immutable fact about a loan's lifecycle.
    """

    __tablename__ = "loan_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # ── Identity ─────────────────────────────────────────────
    loan_id: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True,
        comment="Logical loan identifier (from CSV loan_id column)",
    )

    # ── Event classification ─────────────────────────────────
    event_type: Mapped[str] = mapped_column(
        Enum(EventType, native_enum=False, length=30),
        nullable=False,
        index=True,
    )

    # ── Payload ──────────────────────────────────────────────
    payload_json: Mapped[str] = mapped_column(
        Text, nullable=False,
        comment="Full event data as canonical JSON",
    )

    # ── Provenance ───────────────────────────────────────────
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        Integer, nullable=True,
        comment="FK to users.id – nullable for system-generated events",
    )

    # ── Integrity ────────────────────────────────────────────
    event_hash: Mapped[str] = mapped_column(
        String(64), nullable=False,
        comment="SHA-256 chained hash (includes previous event hash)",
    )

    # ── Source lineage ───────────────────────────────────────
    source_file: Mapped[str] = mapped_column(
        String(255), nullable=True,
        comment="Original CSV filename",
    )
    source_line: Mapped[int] = mapped_column(
        Integer, nullable=True,
        comment="Row number in source CSV (1-indexed)",
    )

    def __repr__(self) -> str:
        return (
            f"<LoanEvent {self.id}: {self.event_type} "
            f"loan={self.loan_id} @ {self.timestamp}>"
        )
