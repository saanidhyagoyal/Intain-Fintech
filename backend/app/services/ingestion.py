"""
Ingestion Service – CSV parsing, multi-source conflict detection, and event emission.

Supports three source types:
  1. loan_tape.csv        – primary loan data (emits LOAN_IMPORTED events)
  2. servicer_update.csv  – updates from servicer (emits CONFLICT_DETECTED if values differ)
  3. document_manifest.csv – document checklist (emits DOCUMENT_MISSING for gaps)
"""

import csv
import io
import logging
import re
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

logger = logging.getLogger(__name__)

# ── CSV column normalization mapping ─────────────────────────
# Maps common CSV header variations to canonical field names
_HEADER_ALIASES = {
    "loanid": "loan_id",
    "loan id": "loan_id",
    "loan_number": "loan_id",
    "loan_identifier": "loan_id",
    "borrowerid": "borrower_id",
    "borrower id": "borrower_id",
    "loantype": "loan_type",
    "loan type": "loan_type",
    "amortization_type": "loan_type",
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
    "original_upb": "original_principal",
    "currentbalance": "current_balance",
    "current balance": "current_balance",
    "cur_balance": "current_balance",
    "current_actual_upb": "current_balance",
    "interestrate": "interest_rate",
    "interest rate": "interest_rate",
    "rate": "interest_rate",
    "original_interest_rate": "interest_rate",
    "current_interest_rate": "interest_rate",
    "termmonths": "term_months",
    "term months": "term_months",
    "term": "term_months",
    "original_loan_term": "term_months",
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
    "borrower_credit_score": "credit_grade",
    "employmentlength": "employment_length",
    "employment length": "employment_length",
    "emp_length": "employment_length",
    "incomeband": "income_band",
    "income band": "income_band",
    "income": "income_band",
    "debt_to_income_dti": "income_band",
    "paymentstatus": "payment_status",
    "payment status": "payment_status",
    "status": "payment_status",
    "current_loan_delinquency_status": "payment_status",
    "dayspastdue": "days_past_due",
    "days past due": "days_past_due",
    "dpd": "days_past_due",
    "servicername": "servicer_name",
    "servicer name": "servicer_name",
    "servicer": "servicer_name",
    "servicer_name": "servicer_name",
    "seller_name": "servicer_name",
    "lastpaymentdate": "last_payment_date",
    "last payment date": "last_payment_date",
    "last_payment": "last_payment_date",
    "last_paid_installment_date": "last_payment_date",
    "lastupdatedat": "last_updated_at",
    "last updated at": "last_updated_at",
    "last_update": "last_updated_at",
    "documentstatus": "document_status",
    "document status": "document_status",
    "doc_status": "document_status",
    "sourcesystem": "source_system",
    "source system": "source_system",
    "source": "source_system",
    # Document manifest custodial columns
    "custodian_vault_id": "custodian_vault_id",
    "custody_audit_date": "custody_audit_date",
}

# ── Null sentinel values to treat as None ────────────────────
_NULL_SENTINELS = {
    "", "n/a", "na", "null", "none", "-", "--", "#n/a", "#na", "#ref!",
    "#value!", "nan", ".", "..", "missing", "unknown", "undefined",
}


def _normalize_header(header: str) -> str:
    """Map a raw CSV header to a canonical loan field name."""
    cleaned = header.strip().lower().replace("-", "_")
    return _HEADER_ALIASES.get(cleaned, cleaned)


def _is_null(raw: Optional[str]) -> bool:
    """Check whether a raw value is semantically null."""
    if raw is None:
        return True
    return raw.strip().lower() in _NULL_SENTINELS


def _clean_currency(raw: str) -> Optional[float]:
    """
    Strip currency symbols, commas, whitespace, and 'USD' from a raw string,
    then parse as float.
    e.g. "$ 350,000.00" → 350000.0, "$1,234.56 USD" → 1234.56
    """
    if _is_null(raw):
        return None
    cleaned = raw.strip()
    cleaned = cleaned.replace("$", "").replace(",", "").replace("USD", "").replace("usd", "").strip()
    # Handle parenthetical negatives like "(500.00)"
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = "-" + cleaned[1:-1]
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return None


def _clean_rate(raw: str) -> Optional[float]:
    """
    Strip % sign and parse as float.
    e.g. "6.5%" → 6.5, " 3.25 % " → 3.25
    """
    if _is_null(raw):
        return None
    cleaned = raw.strip().replace("%", "").strip()
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return None


def _clean_int(raw: str) -> Optional[int]:
    """Parse an integer from potentially dirty input."""
    if _is_null(raw):
        return None
    cleaned = raw.strip().replace(",", "")
    try:
        return int(float(cleaned))
    except (ValueError, TypeError):
        return None


def _parse_multi_date(raw: str) -> Optional[str]:
    """
    Try multiple date formats and return ISO YYYY-MM-DD or None.
    Supports: YYYY-MM-DD, MM/DD/YYYY, YYYYMM, DD-Mon-YYYY, epoch timestamps.
    """
    if _is_null(raw):
        return None
    s = str(raw).strip()

    # Check for pure epoch timestamp (large integers like 1346697000)
    if re.match(r"^\d{9,10}$", s):
        try:
            dt = datetime.fromtimestamp(int(s), tz=timezone.utc)
            return dt.strftime("%Y-%m-%d")
        except (ValueError, OSError, OverflowError):
            pass

    # YYYYMM format (e.g., "203907")
    if re.match(r"^\d{6}$", s):
        try:
            dt = datetime.strptime(s, "%Y%m")
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

    # Standard formats
    for fmt in (
        "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d",
        "%m-%d-%Y", "%d-%m-%Y",
        "%d-%b-%Y",   # 18-Jun-2027
        "%b-%d-%Y",   # Jun-18-2027
        "%d %b %Y",   # 18 Jun 2027
        "%b %d, %Y",  # Jun 18, 2027
        "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    return None  # Could not parse – keep raw so validator will flag it


def _coerce_value(field: str, raw: str) -> Optional[object]:
    """Attempt to coerce a raw CSV string to the appropriate type with dirty data handling."""
    if _is_null(raw):
        return None

    raw = raw.strip()

    # Numeric currency fields
    if field in ("original_principal", "current_balance"):
        val = _clean_currency(raw)
        return val if val is not None else raw  # Keep raw for validator to flag

    # Rate field (strip %)
    if field == "interest_rate":
        val = _clean_rate(raw)
        return val if val is not None else raw

    # Integer fields
    if field in ("term_months", "days_past_due"):
        val = _clean_int(raw)
        return val if val is not None else raw

    # Date fields – normalize to YYYY-MM-DD
    if field in ("origination_date", "maturity_date", "last_payment_date", "last_updated_at"):
        parsed = _parse_multi_date(raw)
        return parsed if parsed is not None else raw  # Keep raw for validator to flag

    return raw


async def ingest_loan_tape(
    db: Session,
    file: UploadFile,
    user_id: int,
) -> dict:
    """
    Parse a loan_tape.csv file and emit LOAN_IMPORTED events.
    Uses streaming to avoid loading entire file into RAM.
    Batch-commits every 1000 rows for scalability.
    """
    content = await file.read()
    filename = file.filename or "loan_tape.csv"
    return _process_loan_tape(db, content, filename, user_id)


def ingest_loan_tape_streaming(
    db: Session,
    content: bytes,
    filename: str,
    user_id: int,
) -> dict:
    """Synchronous entry point for background task processing."""
    return _process_loan_tape(db, content, filename, user_id)


def _process_loan_tape(
    db: Session,
    content: bytes,
    filename: str,
    user_id: int,
) -> dict:
    """Core loan tape processing with batch commits."""
    import json
    from datetime import datetime, timezone
    from sqlalchemy import insert, distinct
    from app.core.cryptography import compute_event_hash

    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    imported = 0
    failed_rows = []
    BATCH_SIZE = 5000
    total_csv_rows = 0

    # 1. Bulk Idempotency Check
    existing_ids = set(get_all_loan_ids(db))
    batch_data = []

    for line_num, row in enumerate(reader, start=2):
        total_csv_rows += 1
        # 3. Empty Row & Junk Data Handling
        if not any(v for k, v in row.items() if k is not None and str(v).strip()):
            continue

        try:
            normalized = {}
            for raw_header, value in row.items():
                if raw_header is None:
                    continue
                canon = _normalize_header(raw_header)
                if canon in LOAN_FIELDS:
                    normalized[canon] = _coerce_value(canon, value)

            loan_id = normalized.get("loan_id")
            if not loan_id or _is_null(str(loan_id)):
                failed_rows.append({
                    "line": line_num,
                    "reason": "Missing loan_id",
                    "data": {k: v for k, v in row.items() if k is not None},
                })
                continue

            loan_id = str(loan_id).strip()

            # Skip duplicate uploads
            if loan_id in existing_ids:
                continue

            normalized["loan_id"] = loan_id
            
            # 2. SQLAlchemy Core Bulk Inserts
            event_hash = compute_event_hash(normalized, None)
            batch_data.append({
                "loan_id": loan_id,
                "event_type": EventType.LOAN_IMPORTED.value,
                "payload_json": json.dumps(normalized, default=str),
                "timestamp": datetime.now(timezone.utc),
                "user_id": user_id,
                "event_hash": event_hash,
                "source_file": filename,
                "source_line": line_num,
            })
            
            existing_ids.add(loan_id)
            imported += 1

            if len(batch_data) >= BATCH_SIZE:
                db.execute(insert(LoanEvent), batch_data)
                db.commit()
                batch_data.clear()
                
        except Exception as e:
            logger.error(
                "Row %d failed during loan_tape ingestion: %s",
                line_num, str(e), exc_info=True,
            )
            failed_rows.append({
                "line": line_num,
                "reason": str(e),
                "data": {k: v for k, v in row.items() if k is not None},
            })

    if batch_data:
        db.execute(insert(LoanEvent), batch_data)
        db.commit()
        batch_data.clear()

    # Run validation on all imported loans
    validator = ValidationEngine(db)
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

    append_event(
        db=db,
        loan_id="SYSTEM",
        event_type=EventType.FILE_UPLOADED,
        payload={
            "source_type": "loan_tape",
            "total_rows": total_csv_rows,
            "exceptions": validation_exceptions,
        },
        user_id=user_id,
        source_file=filename,
        source_line=None
    )
    db.commit()

    return {
        "filename": filename,
        "total_rows": total_csv_rows,
        "imported_count": imported,
        "failed_count": len(failed_rows),
        "failed_rows": failed_rows[:100],
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

    # Source-file dedup guard: skip if this exact file was already ingested
    already_ingested = (
        db.query(LoanEvent.id)
        .filter(LoanEvent.source_file == filename, LoanEvent.event_type == EventType.DOCUMENT_MISSING)
        .first()
    )
    if already_ingested:
        return {
            "filename": filename,
            "total_rows": 0,
            "imported_count": 0,
            "failed_count": 0,
            "failed_rows": [],
            "validation_exceptions": 0,
            "conflicts_detected": 0,
            "source_type": "document_manifest",
            "skipped_reason": "file already ingested",
        }

    missing_count = 0
    processed = 0

    for line_num, row in enumerate(reader, start=2):
        # Extract loan_id from multiple possible column names
        loan_id = (
            row.get("loan_id") or row.get("loanid") or row.get("Loan ID")
            or row.get("loan_identifier") or ""
        ).strip()

        if not loan_id or _is_null(loan_id):
            continue

        processed += 1

        # Check per-column document statuses (chaos format has individual columns)
        # e.g. promissory_note_status, title_deed_status, closing_disclosure_status
        doc_status_columns = {
            "promissory_note_status": "Promissory Note",
            "title_deed_status": "Title Deed",
            "closing_disclosure_status": "Closing Disclosure",
        }

        found_individual_cols = False
        for col, doc_label in doc_status_columns.items():
            val = row.get(col, "").strip().upper()
            if val:
                found_individual_cols = True
                if val in ("MISSING", "INCOMPLETE", "EXPIRED"):
                    doc_type = doc_label
                    doc_status = val

                    append_event(
                        db=db,
                        loan_id=loan_id,
                        event_type=EventType.DOCUMENT_MISSING,
                        payload={
                            "document_type": doc_type,
                            "document_status": doc_status,
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
                        expected_value="VERIFIED",
                        actual_value=doc_status,
                        description=f"Required document '{doc_type}' is {doc_status}",
                        severity=Severity.HIGH,
                        status=ExceptionStatus.OPEN,
                    )
                    db.add(exc)
                    missing_count += 1

        # Fallback: legacy single-column format (document_type + status)
        if not found_individual_cols:
            doc_type = (row.get("document_type") or row.get("doc_type") or row.get("Document Type") or "").strip()
            doc_status = (row.get("status") or row.get("doc_status") or row.get("Status") or "").strip().upper()
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


# ── Synchronous streaming helpers for BackgroundTasks ────────
def ingest_servicer_update_streaming(
    db: Session, content: bytes, filename: str, user_id: int
) -> dict:
    """Sync entry point for background servicer update ingestion."""
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    # Source-file dedup guard: skip if this exact file was already ingested
    already_ingested = (
        db.query(LoanEvent.id)
        .filter(
            LoanEvent.source_file == filename,
            LoanEvent.event_type.in_([EventType.CONFLICT_DETECTED, EventType.LOAN_IMPORTED]),
        )
        .first()
    )
    if already_ingested:
        return {"filename": filename, "total_rows": 0, "imported_count": 0,
                "failed_count": 0, "failed_rows": [], "validation_exceptions": 0,
                "conflicts_detected": 0, "source_type": "servicer_update",
                "skipped_reason": "file already ingested"}

    conflicts_detected = 0
    imported = 0
    failed_rows = []
    total_csv_rows = 0
    existing_loan_ids = set(get_all_loan_ids(db))
    seen_in_this_file = set()  # Within-file dedup

    for line_num, row in enumerate(reader, start=2):
        total_csv_rows += 1
        # Skip completely blank rows
        if not any(v for k, v in row.items() if k is not None and str(v).strip()):
            continue

        try:
            normalized = {}
            for raw_header, value in row.items():
                canon = _normalize_header(raw_header)
                if canon in LOAN_FIELDS:
                    normalized[canon] = _coerce_value(canon, value)

            loan_id = normalized.get("loan_id")
            if not loan_id:
                continue
            loan_id = str(loan_id).strip()

            # Skip if already processed in this file
            if loan_id in seen_in_this_file:
                continue
            seen_in_this_file.add(loan_id)

            if loan_id in existing_loan_ids:
                current_state = project_loan_state(db, loan_id)
                conflicts = {}
                for field in LOAN_FIELDS:
                    if field == "loan_id":
                        continue
                    new_val = normalized.get(field)
                    old_val = current_state.get(field)
                    if new_val is not None and old_val is not None:
                        if str(new_val).strip() != str(old_val).strip():
                            conflicts[field] = {"loan_tape_value": old_val, "servicer_value": new_val}
                if conflicts:
                    append_event(db=db, loan_id=loan_id, event_type=EventType.CONFLICT_DETECTED,
                                 payload={"conflicts": conflicts, "source": "servicer_update"},
                                 user_id=user_id, source_file=filename, source_line=line_num)
                    conflicts_detected += 1
                    from app.models.exception import ExceptionRecord, Severity, ExceptionStatus
                    for field, info in conflicts.items():
                        db.add(ExceptionRecord(
                            loan_id=loan_id, rule_id="SERVICER_CONFLICT", field_name=field,
                            expected_value=str(info["loan_tape_value"]),
                            actual_value=str(info["servicer_value"]),
                            description=f"Servicer update conflicts with loan tape for field '{field}'",
                            severity=Severity.HIGH, status=ExceptionStatus.OPEN))
            else:
                normalized["loan_id"] = loan_id
                append_event(db=db, loan_id=loan_id, event_type=EventType.LOAN_IMPORTED,
                             payload=normalized, user_id=user_id, source_file=filename, source_line=line_num)
            imported += 1
            if imported % 1000 == 0:
                db.commit()

        except Exception as e:
            logger.error("Row %d failed during servicer_update ingestion: %s", line_num, str(e), exc_info=True)
            failed_rows.append({"line": line_num, "reason": str(e),
                                "data": {k: v for k, v in row.items() if k is not None}})

    append_event(
        db=db,
        loan_id="SYSTEM",
        event_type=EventType.FILE_UPLOADED,
        payload={
            "source_type": "servicer_update",
            "total_rows": total_csv_rows,
            "exceptions": conflicts_detected,
        },
        user_id=user_id,
        source_file=filename,
        source_line=None
    )
    db.commit()
    return {"filename": filename, "total_rows": total_csv_rows,
            "imported_count": imported, "failed_count": len(failed_rows),
            "failed_rows": failed_rows[:100], "validation_exceptions": 0,
            "conflicts_detected": conflicts_detected, "source_type": "servicer_update"}


def ingest_document_manifest_streaming(
    db: Session, content: bytes, filename: str, user_id: int
) -> dict:
    """Sync entry point for background document manifest ingestion."""
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    # Source-file dedup guard: skip if this exact file was already ingested
    already_ingested = (
        db.query(LoanEvent.id)
        .filter(LoanEvent.source_file == filename, LoanEvent.event_type == EventType.DOCUMENT_MISSING)
        .first()
    )
    if already_ingested:
        return {"filename": filename, "total_rows": 0, "imported_count": 0,
                "failed_count": 0, "failed_rows": [], "validation_exceptions": 0,
                "conflicts_detected": 0, "source_type": "document_manifest",
                "skipped_reason": "file already ingested"}

    missing_count = 0
    processed = 0
    failed_count = 0
    total_csv_rows = 0

    for line_num, row in enumerate(reader, start=2):
        total_csv_rows += 1
        # Skip completely blank rows
        if not any(v for k, v in row.items() if k is not None and str(v).strip()):
            continue

        try:
            loan_id = (
                row.get("loan_id") or row.get("loanid") or row.get("Loan ID")
                or row.get("loan_identifier") or ""
            ).strip()
            if not loan_id or _is_null(loan_id):
                continue
            processed += 1

            # Extract custody_audit_date for audit trail
            custody_audit_date = _parse_multi_date(
                row.get("custody_audit_date", "") or ""
            )

            doc_status_columns = {
                "promissory_note_status": "Promissory Note",
                "title_deed_status": "Title Deed",
                "closing_disclosure_status": "Closing Disclosure",
            }
            found_individual_cols = False
            for col, doc_label in doc_status_columns.items():
                val = row.get(col, "").strip().upper()
                if val:
                    found_individual_cols = True
                    if val in ("MISSING", "INCOMPLETE", "EXPIRED"):
                        append_event(db=db, loan_id=loan_id, event_type=EventType.DOCUMENT_MISSING,
                                     payload={"document_type": doc_label, "document_status": val,
                                              "source": "document_manifest",
                                              "custody_audit_date": custody_audit_date},
                                     user_id=user_id, source_file=filename, source_line=line_num)
                        from app.models.exception import ExceptionRecord, Severity, ExceptionStatus
                        db.add(ExceptionRecord(
                            loan_id=loan_id, rule_id="DOCUMENT_MISSING", field_name="document_status",
                            expected_value="VERIFIED", actual_value=val,
                            description=f"Required document '{doc_label}' is {val}",
                            severity=Severity.HIGH, status=ExceptionStatus.OPEN))
                        missing_count += 1

            if not found_individual_cols:
                doc_type = (row.get("document_type") or row.get("doc_type") or row.get("Document Type") or "").strip()
                doc_status = (row.get("status") or row.get("doc_status") or row.get("Status") or "").strip().upper()
                if doc_status in ("MISSING", "INCOMPLETE", "EXPIRED", ""):
                    append_event(db=db, loan_id=loan_id, event_type=EventType.DOCUMENT_MISSING,
                                 payload={"document_type": doc_type, "document_status": doc_status or "MISSING",
                                          "source": "document_manifest",
                                          "custody_audit_date": custody_audit_date},
                                 user_id=user_id, source_file=filename, source_line=line_num)
                    from app.models.exception import ExceptionRecord, Severity, ExceptionStatus
                    db.add(ExceptionRecord(
                        loan_id=loan_id, rule_id="DOCUMENT_MISSING", field_name="document_status",
                        expected_value="COMPLETE", actual_value=doc_status or "MISSING",
                        description=f"Required document '{doc_type}' is {doc_status or 'MISSING'}",
                        severity=Severity.HIGH, status=ExceptionStatus.OPEN))
                    missing_count += 1

            if processed % 1000 == 0:
                db.commit()

        except Exception as e:
            logger.error("Row %d failed during document_manifest ingestion: %s", line_num, str(e), exc_info=True)
            failed_count += 1

    append_event(
        db=db,
        loan_id="SYSTEM",
        event_type=EventType.FILE_UPLOADED,
        payload={
            "source_type": "document_manifest",
            "total_rows": total_csv_rows,
            "exceptions": missing_count,
        },
        user_id=user_id,
        source_file=filename,
        source_line=None
    )
    db.commit()
    return {"filename": filename, "total_rows": total_csv_rows, "imported_count": processed,
            "failed_count": failed_count, "failed_rows": [], "validation_exceptions": missing_count,
            "conflicts_detected": 0, "source_type": "document_manifest"}
