"""
Self-Healing Validation Pipeline.

Analyzes recent HUMAN_EDIT_APPLIED events to detect recurring manual corrections.
When the same field→value mapping is applied 3+ times, triggers AI rule synthesis
to automate the fix in future ingestion runs.

This shifts the workload from manual review to automated ingestion.
"""

import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.event import EventType, LoanEvent
from app.models.rule import RuleType, ValidationRule
from app.services.ai_assistant import suggest_rule
from app.services.event_store import append_event


def detect_recurring_patterns(
    db: Session,
    field_name: Optional[str] = None,
    min_occurrences: int = 3,
) -> list[dict]:
    """
    Scan recent HUMAN_EDIT_APPLIED events for repeated field→value corrections.

    Returns a list of pattern dicts:
    {
        "field_name": "borrower_state",
        "count": 5,
        "transformations": {"FL": "Florida", "CA": "California"},
        "examples": [{"loan_id": "L001", "old": "FL", "new": "Florida"}, ...],
        "event_ids": [12, 15, 18, 22, 25],
    }
    """
    # Query all human edit events
    query = db.query(LoanEvent).filter(
        LoanEvent.event_type == EventType.HUMAN_EDIT_APPLIED
    )

    events = query.all()

    # Group corrections by (field_name, old_value → new_value)
    field_corrections = defaultdict(lambda: {
        "count": 0,
        "transformations": {},
        "examples": [],
        "event_ids": [],
    })

    for event in events:
        try:
            payload = json.loads(event.payload_json)
            patch = payload.get("patch", {})
            old_values = payload.get("old_values", {})

            for field, new_val in patch.items():
                if field_name and field != field_name:
                    continue

                old_val = old_values.get(field, "UNKNOWN")
                key = field

                entry = field_corrections[key]
                entry["count"] += 1

                old_str = str(old_val)
                new_str = str(new_val)
                if old_str not in entry["transformations"]:
                    entry["transformations"][old_str] = new_str

                entry["examples"].append({
                    "loan_id": event.loan_id,
                    "old": old_val,
                    "new": new_val,
                    "timestamp": event.timestamp.isoformat(),
                })
                entry["event_ids"].append(event.id)

        except (json.JSONDecodeError, AttributeError):
            continue

    # Filter to patterns with sufficient occurrences
    patterns = []
    for field, data in field_corrections.items():
        if data["count"] >= min_occurrences:
            patterns.append({
                "field_name": field,
                "count": data["count"],
                "transformations": data["transformations"],
                "examples": data["examples"][:10],  # Cap examples
                "event_ids": data["event_ids"],
            })

    return sorted(patterns, key=lambda p: p["count"], reverse=True)


async def synthesize_rule(
    db: Session,
    pattern: dict,
    user_id: Optional[int] = None,
) -> Optional[ValidationRule]:
    """
    Given a detected recurring pattern, call the AI to synthesize a new rule
    and store it in the validation_rules table.

    The rule is created as INACTIVE by default – requires admin approval
    (or can be auto-activated if configured).
    """
    # Check if a rule already exists for this pattern
    existing = (
        db.query(ValidationRule)
        .filter(
            ValidationRule.field_name == pattern["field_name"],
            ValidationRule.rule_type == RuleType.AI_GENERATED,
        )
        .first()
    )

    if existing:
        # Update existing rule with new transformations
        try:
            current_transform = json.loads(existing.transformation_json or "{}")
            current_map = current_transform.get("map", {})
            current_map.update(pattern.get("transformations", {}))
            existing.transformation_json = json.dumps({"map": current_map})
            db.flush()
            return existing
        except (json.JSONDecodeError, TypeError):
            pass

    # Call AI to synthesize a new rule
    ai_response = await suggest_rule(pattern)

    rule = ValidationRule(
        rule_name=ai_response.get("rule_name", f"auto_rule_{pattern['field_name']}"),
        rule_type=RuleType.AI_GENERATED,
        field_name=pattern["field_name"],
        condition_json=json.dumps(ai_response.get("condition_json")) if ai_response.get("condition_json") else None,
        transformation_json=json.dumps(ai_response.get("transformation_json")) if ai_response.get("transformation_json") else None,
        error_message=ai_response.get("error_message", ""),
        severity=ai_response.get("severity", "MEDIUM"),
        is_active=False,  # Requires approval
        created_by="AI",
        source_event_ids=",".join(str(eid) for eid in pattern.get("event_ids", [])),
        ai_prompt=ai_response.get("prompt_used", ""),
        ai_model=ai_response.get("model_name", ""),
    )

    db.add(rule)
    db.flush()

    # Emit a RULE_GENERATED event
    append_event(
        db=db,
        loan_id="SYSTEM",
        event_type=EventType.RULE_GENERATED,
        payload={
            "rule_id": rule.id,
            "rule_name": rule.rule_name,
            "field_name": rule.field_name,
            "transformation": ai_response.get("transformation_json"),
            "pattern_count": pattern["count"],
            "model_name": ai_response.get("model_name", ""),
        },
        user_id=user_id,
    )

    return rule
