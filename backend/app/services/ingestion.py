"""
Ingestion Service – CSV parsing, multi-source conflict detection, and event emission.

Supports three source types:
  1. loan_tape.csv        – primary loan data (emits LOAN_IMPORTED events)
  2. servicer_update.csv  – updates from servicer (emits CONFLICT_DETECTED if values differ)
  3. document_manifest.csv – document checklist (emits DOCUMENT_MISSING for gaps)
"""

import csv
import io
from datetime import datetime, timezone
from typing import Optional

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.models.event import EventType, LoanEvent
from app.services.event_store import (
    LOAN_FIELDS,
    append_event,
    get_all_loan_ids,
    project_loan_state,
)
from app.services.validation import ValidationEngine


# ── CSV column normalization mapping ─────────────────────────
# Maps common CSV header variations to canonical field names
_HEADER_ALIASES = {
    "loanid": "loan_id",
    "loan id": "loan_id",
    "loan_number": "loan_id",
    "borrowerid": "borrower_id",
    "borrower id": "borrower_id",
    "loantype": "loan_type",
    "loan type": "loan_type",
    "originationdate": "origination_date",
    "origination date": "origination_date",
    "orig_date": "origination_date",
    "maturitydate": "maturity_date",
    "maturity date": "maturity_date",
    "mat_date": "maturity_date",
    "originalprincipal": "original_principal",
    "original principal": "original_principal",
    "orig_principal": "original_principal",
    "original_balance": "original_principal",
    "currentbalance": "current_balance",
    "current balance": "current_balance",
    "cur_balance": "current_balance",
    "interestrate": "interest_rate",
    "interest rate": "interest_rate",
    "rate": "interest_rate",
    "termmonths": "term_months",
    "term months": "term_months",
    "term": "term_months",
    "borrowerstate": "borrower_state",
    "borrower state": "borrower_state",
    "state": "borrower_state",
    "property_state": "borrower_state",
    "loanpurpose": "loan_purpose",
    "loan purpose": "loan_purpose",
    "purpose": "loan_purpose",
    "creditgrade": "credit_grade",
    "credit grade": "credit_grade",
    "grade": "credit_grade",
    "employmentlength": "employment_length",
    "employment length": "employment_length",
    "emp_length": "employment_length",
    "incomeband": "income_band",
    "income band": "income_band",
    "income": "income_band",
    "paymentstatus": "payment_status",
    "payment status": "payment_status",
    "status": "payment_status",
    "dayspastdue": "days_past_due",
    "days past due": "days_past_due",
    "dpd": "days_past_due",
    "servicername": "servicer_name",
    "servicer name": "servicer_name",
    "servicer": "servicer_name",
    "lastpaymentdate": "last_payment_date",
    "last payment date": "last_payment_date",
    "last_payment": "last_payment_date",
    "lastupdatedat": "last_updated_at",
    "last updated at": "last_updated_at",
    "last_update": "last_updated_at",
    "documentstatus": "document_status",
    "document status": "document_status",
    "doc_status": "document_status",
    "sourcesystem": "source_system",
    "source system": "source_system",
    "source": "source_system",
}


def _normalize_header(header: str) -> str:
    """Map a raw CSV header to a canonical loan field name."""
    cleaned = header.strip().lower().replace("-", "_")
    return _HEADER_ALIASES.get(cleaned, cleaned)


def _coerce_value(field: str, raw: str) -> Optional[object]:
    """Attempt to coerce a raw CSV string to the appropriate type."""
    if raw is None or raw.strip() == "":
        return None

    raw = raw.strip()

    # Numeric fields
    if field in ("original_principal", "current_balance", "interest_rate"):
        try:
            return float(raw.replace(",", "").replace("$", ""))
        except (ValueError, TypeError):
            return raw  # Keep raw – validation will flag it

    if field in ("term_months", "days_past_due"):
        try:
            return int(float(raw))
        except (ValueError, TypeError):
            return raw

    return raw


async def ingest_loan_tape(
    db: Session,
    file: UploadFile,
    user_id: int,
) -> dict:
    """
    Parse a loan_tape.csv file and emit LOAN_IMPORTED events.
    Returns an IngestionResult-compatible dict.
    """
    content = await file.read()
    text = content.decode("utf-8-sig")  # Handle BOM
    reader = csv.DictReader(io.StringIO(text))

    filename = file.filename or "loan_tape.csv"
    imported = 0
    failed_rows = []

    for line_num, row in enumerate(reader, start=2):  # Row 1 is header
        # Normalize headers
        normalized = {}
        for raw_header, value in row.items():
            canon = _normalize_header(raw_header)
            if canon in LOAN_FIELDS:
                normalized[canon] = _coerce_value(canon, value)

        # Must have a loan_id
        loan_id = normalized.get("loan_id")
        if not loan_id:
            failed_rows.append({
                "line": line_num,
                "reason": "Missing loan_id",
                "data": dict(row),
            })
            continue

        loan_id = str(loan_id).strip()
        normalized["loan_id"] = loan_id

        try:
            append_event(
                db=db,
                loan_id=loan_id,
                event_type=EventType.LOAN_IMPORTED,
                payload=normalized,
                user_id=user_id,
                source_file=filename,
                source_line=line_num,
            )
            imported += 1
        except Exception as e:
            failed_rows.append({
                "line": line_num,
                "reason": str(e),
                "data": dict(row),
            })

    db.commit()

    # Run validation on all imported loans
    validator = ValidationEngine(db)
    # Re-query the unique loan_ids that were just imported
    from sqlalchemy import distinct
    recent_loan_ids = (
        db.query(distinct(LoanEvent.loan_id))
        .filter(LoanEvent.source_file == filename)
        .all()
    )
    validation_exceptions = 0
    for (lid,) in recent_loan_ids:
        state = project_loan_state(db, lid)
        exceptions = validator.validate_loan(lid, state, user_id)
        validation_exceptions += len(exceptions)

    db.commit()

    return {
        "filename": filename,
        "total_rows": imported + len(failed_rows),
        "imported_count": imported,
        "failed_count": len(failed_rows),
        "failed_rows": failed_rows[:50],  # Cap failed details
        "validation_exceptions": validation_exceptions,
        "conflicts_detected": 0,
        "source_type": "loan_tape",
    }


async def ingest_servicer_update(
    db: Session,
    file: UploadFile,
    user_id: int,
) -> dict:
    """
    Parse a servicer_update.csv and detect conflicts against existing loan_tape data.
    Emits CONFLICT_DETECTED events for differing field values.
    """
    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    filename = file.filename or "servicer_update.csv"
    conflicts_detected = 0
    imported = 0
    failed_rows = []

    existing_loan_ids = set(get_all_loan_ids(db))

    for line_num, row in enumerate(reader, start=2):
        normalized = {}
        for raw_header, value in row.items():
            canon = _normalize_header(raw_header)
            if canon in LOAN_FIELDS:
                normalized[canon] = _coerce_value(canon, value)

        loan_id = normalized.get("loan_id")
        if not loan_id:
            failed_rows.append({
                "line": line_num,
                "reason": "Missing loan_id",
                "data": dict(row),
            })
            continue

        loan_id = str(loan_id).strip()

        if loan_id in existing_loan_ids:
            # Compare against current projected state
            current_state = project_loan_state(db, loan_id)
            conflicts = {}

            for field in LOAN_FIELDS:
                if field == "loan_id":
                    continue
                new_val = normalized.get(field)
                old_val = current_state.get(field)
                if new_val is not None and old_val is not None:
                    if str(new_val).strip() != str(old_val).strip():
                        conflicts[field] = {
                            "loan_tape_value": old_val,
                            "servicer_value": new_val,
                        }

            if conflicts:
                append_event(
                    db=db,
                    loan_id=loan_id,
                    event_type=EventType.CONFLICT_DETECTED,
                    payload={"conflicts": conflicts, "source": "servicer_update"},
                    user_id=user_id,
                    source_file=filename,
                    source_line=line_num,
                )
                conflicts_detected += 1

                # Also create exception records for each conflict
                from app.models.exception import ExceptionRecord, Severity, ExceptionStatus
                for field, info in conflicts.items():
                    exc = ExceptionRecord(
                        loan_id=loan_id,
                        rule_id="SERVICER_CONFLICT",
                        field_name=field,
                        expected_value=str(info["loan_tape_value"]),
                        actual_value=str(info["servicer_value"]),
                        description=f"Servicer update conflicts with loan tape for field '{field}'",
                        severity=Severity.HIGH,
                        status=ExceptionStatus.OPEN,
                    )
                    db.add(exc)
        else:
            # New loan from servicer – import it
            normalized["loan_id"] = loan_id
            append_event(
                db=db,
                loan_id=loan_id,
                event_type=EventType.LOAN_IMPORTED,
                payload=normalized,
                user_id=user_id,
                source_file=filename,
                source_line=line_num,
            )

        imported += 1

    db.commit()

    return {
        "filename": filename,
        "total_rows": imported + len(failed_rows),
        "imported_count": imported,
        "failed_count": len(failed_rows),
        "failed_rows": failed_rows[:50],
        "validation_exceptions": 0,
        "conflicts_detected": conflicts_detected,
        "source_type": "servicer_update",
    }


async def ingest_document_manifest(
    db: Session,
    file: UploadFile,
    user_id: int,
) -> dict:
    """
    Parse document_manifest.csv and cross-reference against existing loans.
    Emits DOCUMENT_MISSING events for loans missing required documents.
    """
    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    filename = file.filename or "document_manifest.csv"
    missing_count = 0
    processed = 0

    for line_num, row in enumerate(reader, start=2):
        loan_id = (row.get("loan_id") or row.get("loanid") or row.get("Loan ID") or "").strip()
        doc_type = (row.get("document_type") or row.get("doc_type") or row.get("Document Type") or "").strip()
        doc_status = (row.get("status") or row.get("doc_status") or row.get("Status") or "").strip().upper()

        if not loan_id:
            continue

        processed += 1

        if doc_status in ("MISSING", "INCOMPLETE", "EXPIRED", ""):
            append_event(
                db=db,
                loan_id=loan_id,
                event_type=EventType.DOCUMENT_MISSING,
                payload={
                    "document_type": doc_type,
                    "document_status": doc_status or "MISSING",
                    "source": "document_manifest",
                },
                user_id=user_id,
                source_file=filename,
                source_line=line_num,
            )

            from app.models.exception import ExceptionRecord, Severity, ExceptionStatus
            exc = ExceptionRecord(
                loan_id=loan_id,
                rule_id="DOCUMENT_MISSING",
                field_name="document_status",
                expected_value="COMPLETE",
                actual_value=doc_status or "MISSING",
                description=f"Required document '{doc_type}' is {doc_status or 'MISSING'}",
                severity=Severity.HIGH,
                status=ExceptionStatus.OPEN,
            )
            db.add(exc)
            missing_count += 1

    db.commit()

    return {
        "filename": filename,
        "total_rows": processed,
        "imported_count": processed,
        "failed_count": 0,
        "failed_rows": [],
        "validation_exceptions": missing_count,
        "conflicts_detected": 0,
        "source_type": "document_manifest",
    }
