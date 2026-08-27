"""
Event Store – the heart of the Event Sourcing architecture.

Provides:
  - append_event():        Append an immutable event with chained hashing
  - project_loan_state():  Replay events to compute current loan state (supports time-travel)
  - get_all_loan_ids():    All distinct loan IDs in the system
  - get_events_for_loan(): Full audit trail for a loan
  - verify_hash_chain():   Validate the integrity of a loan's event chain
"""

import json
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.cryptography import compute_event_hash, compute_record_hash
from app.models.event import EventType, LoanEvent


# ── Canonical field list (PDF Section 6) ─────────────────────
LOAN_FIELDS = [
    "loan_id", "borrower_id", "loan_type", "origination_date", "maturity_date",
    "original_principal", "current_balance", "interest_rate", "term_months",
    "borrower_state", "loan_purpose", "credit_grade", "employment_length",
    "income_band", "payment_status", "days_past_due", "servicer_name",
    "last_payment_date", "last_updated_at", "document_status", "source_system",
]


def append_event(
    db: Session,
    loan_id: str,
    event_type: EventType,
    payload: dict,
    user_id: Optional[int] = None,
    source_file: Optional[str] = None,
    source_line: Optional[int] = None,
) -> LoanEvent:
    """
    Append an immutable event to the ledger.
    The event hash chains to the previous event for tamper evidence.
    """
    # Get the hash of the most recent event for this loan (for chaining)
    last_event = (
        db.query(LoanEvent)
        .filter(LoanEvent.loan_id == loan_id)
        .order_by(LoanEvent.id.desc())
        .first()
    )
    previous_hash = last_event.event_hash if last_event else None

    event_hash = compute_event_hash(payload, previous_hash)

    event = LoanEvent(
        loan_id=loan_id,
        event_type=event_type,
        payload_json=json.dumps(payload, default=str),
        timestamp=datetime.now(timezone.utc),
        user_id=user_id,
        event_hash=event_hash,
        source_file=source_file,
        source_line=source_line,
    )

    db.add(event)
    db.flush()  # Get the ID without committing (caller manages transaction)
    return event


def project_loan_state(
    db: Session,
    loan_id: str,
    up_to: Optional[datetime] = None,
) -> dict:
    """
    Replay all events for a loan to compute its current state.
    If `up_to` is provided, only events up to that timestamp are replayed
    (this is the "Data Time Travel" / rewind feature).

    Returns a dict with the 21 canonical loan fields + metadata.
    """
    query = (
        db.query(LoanEvent)
        .filter(LoanEvent.loan_id == loan_id)
        .order_by(LoanEvent.timestamp.asc(), LoanEvent.id.asc())
    )

    if up_to:
        query = query.filter(LoanEvent.timestamp <= up_to)

    events = query.all()

    if not events:
        return {}

    # Start with empty state and apply events sequentially
    state = {field: None for field in LOAN_FIELDS}
    state["loan_id"] = loan_id
    is_verified = False
    record_hash = None
    has_exceptions = False
    last_event = None

    for event in events:
        payload = json.loads(event.payload_json)
        last_event = event

        if event.event_type == EventType.LOAN_IMPORTED:
            # Initial import – set all fields from the CSV row
            for field in LOAN_FIELDS:
                if field in payload:
                    state[field] = payload[field]

        elif event.event_type in (
            EventType.HUMAN_EDIT_APPLIED,
            EventType.AI_SUGGESTION_APPLIED,
        ):
            # Apply a patch (field corrections)
            patch = payload.get("patch", payload)
            for field, value in patch.items():
                if field in LOAN_FIELDS:
                    state[field] = value

        elif event.event_type == EventType.LOAN_VERIFIED:
            is_verified = True
            record_hash = payload.get("record_hash")

        elif event.event_type == EventType.VALIDATION_FAILED:
            has_exceptions = True

        elif event.event_type == EventType.CONFLICT_DETECTED:
            # Servicer update conflict – store the conflicting values
            conflicts = payload.get("conflicts", {})
            for field, conflict_info in conflicts.items():
                if field in LOAN_FIELDS:
                    # Keep the loan_tape value, flag the conflict
                    pass  # Conflict is recorded as an event; state keeps original

    # Attach projection metadata
    state["event_count"] = len(events)
    state["last_event_type"] = last_event.event_type if last_event else None
    state["last_event_at"] = last_event.timestamp.isoformat() if last_event else None
    state["is_verified"] = is_verified
    state["has_exceptions"] = has_exceptions
    state["record_hash"] = record_hash or compute_record_hash(
        {k: v for k, v in state.items() if k in LOAN_FIELDS}
    )

    return state


def get_all_loan_ids(db: Session) -> list[str]:
    """Return all distinct loan IDs in the event store."""
    rows = (
        db.query(LoanEvent.loan_id)
        .distinct()
        .order_by(LoanEvent.loan_id)
        .all()
    )
    return [r[0] for r in rows]


def get_events_for_loan(db: Session, loan_id: str) -> list[LoanEvent]:
    """Return all events for a loan, ordered chronologically."""
    return (
        db.query(LoanEvent)
        .filter(LoanEvent.loan_id == loan_id)
        .order_by(LoanEvent.timestamp.asc(), LoanEvent.id.asc())
        .all()
    )


def verify_hash_chain(db: Session, loan_id: str) -> bool:
    """
    Verify the integrity of a loan's event hash chain.
    Returns True if the chain is unbroken and all hashes match.
    """
    events = get_events_for_loan(db, loan_id)
    if not events:
        return True

    previous_hash = None
    for event in events:
        payload = json.loads(event.payload_json)
        expected_hash = compute_event_hash(payload, previous_hash)
        if event.event_hash != expected_hash:
            return False
        previous_hash = event.event_hash

    return True


def get_loan_count(db: Session) -> int:
    """Total number of unique loans."""
    return db.query(func.count(func.distinct(LoanEvent.loan_id))).scalar() or 0


def get_event_count(db: Session) -> int:
    """Total number of events across all loans."""
    return db.query(func.count(LoanEvent.id)).scalar() or 0
