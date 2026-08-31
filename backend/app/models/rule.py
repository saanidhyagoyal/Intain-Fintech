"""
ValidationRule – dynamic rules for the self-healing pipeline.

The system starts with hardcoded validation rules. When the self-healing
service detects recurring manual corrections (3+ identical fixes by reviewers),
it calls the LLM to synthesize a new ValidationRule that automates the fix
during future ingestion runs.

Rule types:
  HARDCODED     – built into the validation engine code
  AI_GENERATED  – proposed by the self-healing pipeline
"""

from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RuleSource(str, PyEnum):
    HARDCODED = "HARDCODED"
    AI_SUGGESTED = "AI_SUGGESTED"
    MANUAL = "MANUAL"

class RuleStatus(str, PyEnum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    REJECTED = "REJECTED"


class ValidationRule(Base):
    """
    A configurable validation or transformation rule.
    AI_GENERATED rules are proposed by the self-healing pipeline and
    must be approved (is_active=True) before they affect ingestion.
    """

    __tablename__ = "validation_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # ── Identity ─────────────────────────────────────────────
    rule_name: Mapped[str] = mapped_column(
        String(200), unique=True, nullable=False,
    )
    source: Mapped[str] = mapped_column(
        Enum(RuleSource, native_enum=False, length=15),
        nullable=False,
        default=RuleSource.HARDCODED,
    )

    # ── Scope ────────────────────────────────────────────────
    field_name: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="The loan field this rule applies to",
    )

    # ── Rule definition ──────────────────────────────────────
    condition_json: Mapped[str] = mapped_column(
        Text, nullable=True,
        comment='Validation condition, e.g. {"operator":"gt","value":0}',
    )
    transformation_json: Mapped[str] = mapped_column(
        Text, nullable=True,
        comment='Auto-fix mapping, e.g. {"map":{"FL":"Florida","CA":"California"}}',
    )
    error_message: Mapped[str] = mapped_column(
        String(500), nullable=True,
        comment="Human-readable message when rule fails",
    )
    severity: Mapped[str] = mapped_column(
        String(10), nullable=False, default="MEDIUM",
    )

    # ── AI-Compiled Logic (structured rule payload) ───────────
    logic_payload: Mapped[str] = mapped_column(
        Text, nullable=True,
        comment='AI-compiled structured rule, e.g. {"field":"interest_rate","operator":"greater_than","target_value":100,"action":"flag_review","action_value":null}',
    )

    # ── Lifecycle ────────────────────────────────────────────
    status: Mapped[str] = mapped_column(
        Enum(RuleStatus, native_enum=False, length=15),
        nullable=False,
        default=RuleStatus.ACTIVE,
        index=True,
    )
    created_by: Mapped[str] = mapped_column(
        String(50), nullable=True,
        comment="'SYSTEM' for hardcoded, 'AI' for generated, or username",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # ── Provenance (for AI-generated rules) ──────────────────
    source_event_ids: Mapped[str] = mapped_column(
        Text, nullable=True,
        comment="Comma-separated event IDs that triggered this rule synthesis",
    )
    ai_prompt: Mapped[str] = mapped_column(
        Text, nullable=True,
        comment="The prompt sent to the LLM to generate this rule",
    )
    ai_model: Mapped[str] = mapped_column(
        String(100), nullable=True,
        comment="Model name used (e.g. gemini-2.0-flash)",
    )

    def __repr__(self) -> str:
        return (
            f"<ValidationRule {self.rule_name} ({self.source}) "
            f"field={self.field_name} status={self.status}>"
        )
