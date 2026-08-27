"""
Validation Engine – evaluates loan data against hardcoded + dynamic rules.

Hardcoded rules (Module B):
  - Missing loan_id / borrower_id
  - Invalid date formats
  - Negative balances / principal
  - Maturity date must be after origination date
  - Valid payment status values
  - Duplicate loan detection
  - Stale records (last_updated_at too old)
  - Interest rate range check
  - Term months validity

Dynamic rules are loaded from the validation_rules table
(created by the self-healing pipeline).
"""

import json
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models.event import EventType, LoanEvent
from app.models.exception import ExceptionRecord, ExceptionStatus, Severity
from app.models.rule import RuleType, ValidationRule
from app.services.event_store import append_event


# ── Valid values ──────────────────────────────────────────────
VALID_PAYMENT_STATUSES = {
    "CURRENT", "LATE", "DEFAULT", "DELINQUENT", "PAID_OFF",
    "GRACE_PERIOD", "FORBEARANCE", "CHARGED_OFF", "IN_REPAYMENT",
    "current", "late", "default", "delinquent", "paid_off",
}

VALID_LOAN_TYPES = {
    "CONVENTIONAL", "FHA", "VA", "USDA", "JUMBO", "CONFORMING",
    "FIXED", "ARM", "HELOC", "PERSONAL", "AUTO", "STUDENT",
}

VALID_CREDIT_GRADES = {"A", "B", "C", "D", "E", "F", "G", "AA", "A1", "A2", "A3", "B1", "B2", "B3"}


def _parse_date(value: Optional[str]) -> Optional[datetime]:
    """Try multiple date formats."""
    if not value or str(value).strip() == "":
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%m-%d-%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(str(value).strip(), fmt)
        except ValueError:
            continue
    return None


class ValidationEngine:
    """Evaluates loan data against hardcoded and dynamic rules."""

    def __init__(self, db: Session):
        self.db = db
        self._dynamic_rules = self._load_dynamic_rules()

    def _load_dynamic_rules(self) -> list[ValidationRule]:
        """Load all active AI-generated rules from the database."""
        return (
            self.db.query(ValidationRule)
            .filter(ValidationRule.is_active == True, ValidationRule.rule_type == RuleType.AI_GENERATED)
            .all()
        )

    def validate_loan(
        self,
        loan_id: str,
        state: dict,
        user_id: Optional[int] = None,
    ) -> list[ExceptionRecord]:
        """
        Run all validation rules against a projected loan state.
        Creates ExceptionRecord entries and emits VALIDATION_FAILED events.
        Returns a list of created exceptions.
        """
        exceptions = []

        # ── Hardcoded rules ──────────────────────────────────
        checks = [
            self._check_missing_ids,
            self._check_dates,
            self._check_balances,
            self._check_maturity_after_origination,
            self._check_payment_status,
            self._check_interest_rate,
            self._check_term_months,
            self._check_stale_record,
            self._check_duplicates,
        ]

        for check in checks:
            result = check(loan_id, state)
            if result:
                for exc_data in result:
                    exc = self._create_exception(loan_id, exc_data, user_id)
                    exceptions.append(exc)

        # ── Dynamic rules (self-healing) ─────────────────────
        for rule in self._dynamic_rules:
            result = self._evaluate_dynamic_rule(loan_id, state, rule)
            if result:
                exc = self._create_exception(loan_id, result, user_id)
                exceptions.append(exc)

        return exceptions

    def _create_exception(
        self, loan_id: str, exc_data: dict, user_id: Optional[int]
    ) -> ExceptionRecord:
        """Create an ExceptionRecord and emit a VALIDATION_FAILED event."""
        exc = ExceptionRecord(
            loan_id=loan_id,
            rule_id=exc_data["rule_id"],
            field_name=exc_data["field_name"],
            expected_value=exc_data.get("expected_value"),
            actual_value=exc_data.get("actual_value"),
            description=exc_data.get("description"),
            severity=exc_data.get("severity", Severity.MEDIUM),
            status=ExceptionStatus.OPEN,
        )
        self.db.add(exc)
        self.db.flush()

        # Emit event
        append_event(
            db=self.db,
            loan_id=loan_id,
            event_type=EventType.VALIDATION_FAILED,
            payload={
                "exception_id": exc.id,
                "rule_id": exc_data["rule_id"],
                "field_name": exc_data["field_name"],
                "severity": exc_data.get("severity", "MEDIUM"),
                "description": exc_data.get("description", ""),
            },
            user_id=user_id,
        )

        return exc

    # ── Individual hardcoded checks ──────────────────────────

    def _check_missing_ids(self, loan_id: str, state: dict) -> list[dict]:
        issues = []
        if not state.get("loan_id"):
            issues.append({
                "rule_id": "MISSING_LOAN_ID",
                "field_name": "loan_id",
                "expected_value": "non-empty string",
                "actual_value": str(state.get("loan_id")),
                "description": "Loan ID is missing or empty",
                "severity": Severity.CRITICAL,
            })
        if not state.get("borrower_id"):
            issues.append({
                "rule_id": "MISSING_BORROWER_ID",
                "field_name": "borrower_id",
                "expected_value": "non-empty string",
                "actual_value": str(state.get("borrower_id")),
                "description": "Borrower ID is missing or empty",
                "severity": Severity.HIGH,
            })
        return issues

    def _check_dates(self, loan_id: str, state: dict) -> list[dict]:
        issues = []
        for date_field in ("origination_date", "maturity_date", "last_payment_date"):
            val = state.get(date_field)
            if val is not None and val != "":
                parsed = _parse_date(str(val))
                if parsed is None:
                    issues.append({
                        "rule_id": f"INVALID_DATE_{date_field.upper()}",
                        "field_name": date_field,
                        "expected_value": "valid date (YYYY-MM-DD)",
                        "actual_value": str(val),
                        "description": f"Cannot parse '{val}' as a valid date",
                        "severity": Severity.HIGH,
                    })
        return issues

    def _check_balances(self, loan_id: str, state: dict) -> list[dict]:
        issues = []
        for field in ("original_principal", "current_balance"):
            val = state.get(field)
            if val is not None:
                try:
                    num = float(val)
                    if num < 0:
                        issues.append({
                            "rule_id": f"NEGATIVE_{field.upper()}",
                            "field_name": field,
                            "expected_value": "≥ 0",
                            "actual_value": str(val),
                            "description": f"{field} is negative ({val})",
                            "severity": Severity.CRITICAL,
                        })
                except (ValueError, TypeError):
                    issues.append({
                        "rule_id": f"INVALID_{field.upper()}",
                        "field_name": field,
                        "expected_value": "numeric value",
                        "actual_value": str(val),
                        "description": f"{field} is not a valid number",
                        "severity": Severity.HIGH,
                    })
        return issues

    def _check_maturity_after_origination(self, loan_id: str, state: dict) -> list[dict]:
        orig = _parse_date(str(state.get("origination_date", "")))
        mat = _parse_date(str(state.get("maturity_date", "")))
        if orig and mat and mat <= orig:
            return [{
                "rule_id": "MATURITY_BEFORE_ORIGINATION",
                "field_name": "maturity_date",
                "expected_value": f"after {state.get('origination_date')}",
                "actual_value": str(state.get("maturity_date")),
                "description": "Maturity date must be after origination date",
                "severity": Severity.CRITICAL,
            }]
        return []

    def _check_payment_status(self, loan_id: str, state: dict) -> list[dict]:
        val = state.get("payment_status")
        if val and str(val).strip().upper() not in {s.upper() for s in VALID_PAYMENT_STATUSES}:
            return [{
                "rule_id": "INVALID_PAYMENT_STATUS",
                "field_name": "payment_status",
                "expected_value": f"one of {sorted(VALID_PAYMENT_STATUSES)}",
                "actual_value": str(val),
                "description": f"Unrecognized payment status: '{val}'",
                "severity": Severity.HIGH,
            }]
        return []

    def _check_interest_rate(self, loan_id: str, state: dict) -> list[dict]:
        val = state.get("interest_rate")
        if val is not None:
            try:
                rate = float(val)
                if rate < 0 or rate > 100:
                    return [{
                        "rule_id": "INTEREST_RATE_OUT_OF_RANGE",
                        "field_name": "interest_rate",
                        "expected_value": "0 to 100",
                        "actual_value": str(val),
                        "description": f"Interest rate {rate} is outside valid range (0-100%)",
                        "severity": Severity.HIGH,
                    }]
            except (ValueError, TypeError):
                return [{
                    "rule_id": "INVALID_INTEREST_RATE",
                    "field_name": "interest_rate",
                    "expected_value": "numeric value",
                    "actual_value": str(val),
                    "description": "Interest rate is not a valid number",
                    "severity": Severity.MEDIUM,
                }]
        return []

    def _check_term_months(self, loan_id: str, state: dict) -> list[dict]:
        val = state.get("term_months")
        if val is not None:
            try:
                term = int(float(val))
                if term <= 0 or term > 600:
                    return [{
                        "rule_id": "TERM_MONTHS_OUT_OF_RANGE",
                        "field_name": "term_months",
                        "expected_value": "1 to 600",
                        "actual_value": str(val),
                        "description": f"Term {term} months is outside valid range",
                        "severity": Severity.MEDIUM,
                    }]
            except (ValueError, TypeError):
                pass
        return []

    def _check_stale_record(self, loan_id: str, state: dict) -> list[dict]:
        val = state.get("last_updated_at")
        if val:
            parsed = _parse_date(str(val))
            if parsed:
                stale_threshold = datetime.now(timezone.utc) - timedelta(days=180)
                if parsed.replace(tzinfo=timezone.utc) < stale_threshold:
                    return [{
                        "rule_id": "STALE_RECORD",
                        "field_name": "last_updated_at",
                        "expected_value": "within last 180 days",
                        "actual_value": str(val),
                        "description": f"Record last updated {val}, which is over 180 days ago",
                        "severity": Severity.LOW,
                    }]
        return []

    def _check_duplicates(self, loan_id: str, state: dict) -> list[dict]:
        """Check if this loan_id has more than one LOAN_IMPORTED event (duplicate upload)."""
        import_count = (
            self.db.query(LoanEvent)
            .filter(
                LoanEvent.loan_id == loan_id,
                LoanEvent.event_type == EventType.LOAN_IMPORTED,
            )
            .count()
        )
        if import_count > 1:
            return [{
                "rule_id": "DUPLICATE_LOAN",
                "field_name": "loan_id",
                "expected_value": "unique loan_id",
                "actual_value": f"{import_count} imports",
                "description": f"Loan {loan_id} has been imported {import_count} times (potential duplicate)",
                "severity": Severity.MEDIUM,
            }]
        return []

    def _evaluate_dynamic_rule(
        self, loan_id: str, state: dict, rule: ValidationRule
    ) -> Optional[dict]:
        """Evaluate an AI-generated dynamic rule against loan state."""
        field_val = state.get(rule.field_name)
        if field_val is None:
            return None

        try:
            # Check transformation rules (value mapping)
            if rule.transformation_json:
                transform = json.loads(rule.transformation_json)
                mapping = transform.get("map", {})
                if str(field_val) in mapping:
                    # This is a fixable issue – the value should be mapped
                    correct_val = mapping[str(field_val)]
                    return {
                        "rule_id": f"DYNAMIC_{rule.id}_{rule.rule_name}",
                        "field_name": rule.field_name,
                        "expected_value": correct_val,
                        "actual_value": str(field_val),
                        "description": rule.error_message or f"Value '{field_val}' should be '{correct_val}' (auto-detected pattern)",
                        "severity": rule.severity,
                    }

            # Check condition rules
            if rule.condition_json:
                condition = json.loads(rule.condition_json)
                op = condition.get("operator")
                target = condition.get("value")

                if op == "gt" and float(field_val) <= float(target):
                    return {
                        "rule_id": f"DYNAMIC_{rule.id}_{rule.rule_name}",
                        "field_name": rule.field_name,
                        "expected_value": f"> {target}",
                        "actual_value": str(field_val),
                        "description": rule.error_message or f"{rule.field_name} must be > {target}",
                        "severity": rule.severity,
                    }
                elif op == "lt" and float(field_val) >= float(target):
                    return {
                        "rule_id": f"DYNAMIC_{rule.id}_{rule.rule_name}",
                        "field_name": rule.field_name,
                        "expected_value": f"< {target}",
                        "actual_value": str(field_val),
                        "description": rule.error_message or f"{rule.field_name} must be < {target}",
                        "severity": rule.severity,
                    }
                elif op == "in" and str(field_val) not in target:
                    return {
                        "rule_id": f"DYNAMIC_{rule.id}_{rule.rule_name}",
                        "field_name": rule.field_name,
                        "expected_value": f"one of {target}",
                        "actual_value": str(field_val),
                        "description": rule.error_message or f"{rule.field_name} must be one of {target}",
                        "severity": rule.severity,
                    }

        except (json.JSONDecodeError, ValueError, TypeError):
            pass  # Skip malformed rules gracefully

        return None
