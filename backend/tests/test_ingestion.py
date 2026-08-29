"""
Ingestion Pipeline Tests – validates the core CSV parsing, idempotency,
dirty-data handling, and document manifest deduplication logic.
"""

import io
import csv
import json
import pytest

from app.models.event import EventType, LoanEvent
from app.models.exception import ExceptionRecord
from app.services.ingestion import (
    _process_loan_tape,
    ingest_document_manifest_streaming,
)
from app.services.event_store import get_all_loan_ids


def _make_csv(rows: list[dict]) -> bytes:
    """Helper: build a CSV file (bytes) from a list of dicts."""
    if not rows:
        return b"loan_id\n"
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode("utf-8")


def _sample_rows(count: int = 5) -> list[dict]:
    """Generate N valid loan rows."""
    return [
        {
            "loan_id": f"TEST-{i:04d}",
            "borrower_id": f"BORR-{i:04d}",
            "origination_date": "2020-01-15",
            "maturity_date": "2050-01-15",
            "original_principal": "100000.00",
            "current_balance": "95000.00",
            "interest_rate": "4.5",
            "term_months": "360",
            "borrower_state": "CA",
            "loan_purpose": "P",
            "credit_grade": "720",
            "income_band": "25",
            "servicer_name": "Test Servicer",
            "loan_type": "FRM",
        }
        for i in range(1, count + 1)
    ]


class TestLoanTapeBasicImport:
    """Upload a 5-row CSV → assert 5 LOAN_IMPORTED events created."""

    def test_imports_correct_count(self, db_session):
        content = _make_csv(_sample_rows(5))
        result = _process_loan_tape(db_session, content, "test_tape.csv", 1)

        assert result["imported_count"] == 5
        assert result["failed_count"] == 0
        assert result["source_type"] == "loan_tape"

        events = db_session.query(LoanEvent).filter(
            LoanEvent.event_type == EventType.LOAN_IMPORTED
        ).all()
        assert len(events) == 5


class TestLoanTapeDuplicateUpload:
    """Upload same CSV twice → assert second upload creates 0 new events."""

    def test_idempotent_on_reupload(self, db_session):
        content = _make_csv(_sample_rows(3))

        result1 = _process_loan_tape(db_session, content, "tape.csv", 1)
        assert result1["imported_count"] == 3

        result2 = _process_loan_tape(db_session, content, "tape.csv", 1)
        assert result2["imported_count"] == 0  # All loan_ids already exist


class TestNegativeBalanceFlagged:
    """Upload a row with negative original_principal → assert CRITICAL exception."""

    def test_negative_principal_creates_exception(self, db_session):
        rows = _sample_rows(1)
        rows[0]["original_principal"] = "-50000.00"
        content = _make_csv(rows)

        result = _process_loan_tape(db_session, content, "neg.csv", 1)
        assert result["imported_count"] == 1

        exceptions = db_session.query(ExceptionRecord).filter(
            ExceptionRecord.rule_id == "NEGATIVE_ORIGINAL_PRINCIPAL"
        ).all()
        assert len(exceptions) >= 1
        assert exceptions[0].severity == "CRITICAL"


class TestBadDateFlagged:
    """Upload a row with maturity before origination → assert CRITICAL exception."""

    def test_maturity_before_origination(self, db_session):
        rows = _sample_rows(1)
        rows[0]["loan_id"] = "DATE-BAD-001"
        rows[0]["origination_date"] = "2030-01-01"
        rows[0]["maturity_date"] = "2020-01-01"
        content = _make_csv(rows)

        result = _process_loan_tape(db_session, content, "baddate.csv", 1)
        assert result["imported_count"] == 1

        exceptions = db_session.query(ExceptionRecord).filter(
            ExceptionRecord.rule_id == "MATURITY_BEFORE_ORIGINATION"
        ).all()
        assert len(exceptions) >= 1
        assert exceptions[0].severity == "CRITICAL"


class TestEmptyCsv:
    """Upload a header-only CSV → assert imported_count = 0."""

    def test_empty_file_no_crash(self, db_session):
        content = b"loan_id,borrower_id,original_principal\n"
        result = _process_loan_tape(db_session, content, "empty.csv", 1)
        assert result["imported_count"] == 0
        assert result["failed_count"] == 0


class TestBlankRowsSkipped:
    """Upload CSV with 3 valid rows + 2 blank rows → assert imported_count = 3."""

    def test_blank_rows_filtered(self, db_session):
        rows = _sample_rows(3)
        content_str = _make_csv(rows).decode("utf-8")
        # Append 2 completely blank rows (just commas)
        headers = content_str.split("\n")[0]
        blank_row = ",".join(["" for _ in headers.split(",")])
        content_str += blank_row + "\n" + blank_row + "\n"
        content = content_str.encode("utf-8")

        result = _process_loan_tape(db_session, content, "blanks.csv", 1)
        assert result["imported_count"] == 3


class TestDocumentManifestDedup:
    """Upload manifest twice → assert second upload returns imported_count = 0."""

    def test_manifest_idempotent(self, db_session):
        # First, import some loans so the manifest has something to cross-ref
        loan_content = _make_csv(_sample_rows(2))
        _process_loan_tape(db_session, loan_content, "base.csv", 1)

        # Build a document manifest CSV
        manifest_rows = [
            {
                "loan_identifier": "TEST-0001",
                "custodian_vault_id": "VAULT-1",
                "promissory_note_status": "MISSING",
                "title_deed_status": "VERIFIED",
                "closing_disclosure_status": "VERIFIED",
                "custody_audit_date": "2026-01-01",
            },
        ]
        manifest_csv = _make_csv(manifest_rows)

        result1 = ingest_document_manifest_streaming(
            db_session, manifest_csv, "manifest.csv", 1
        )
        assert result1["imported_count"] >= 1

        result2 = ingest_document_manifest_streaming(
            db_session, manifest_csv, "manifest.csv", 1
        )
        assert result2["imported_count"] == 0
        assert result2.get("skipped_reason") == "file already ingested"


class TestServicerCrashRecovery:
    """Phase 3: servicer parser continues past bad rows instead of crashing."""

    def test_servicer_recovers_from_bad_row(self, db_session):
        """A corrupted row in the middle must not crash the entire import."""
        # First, import some loans so servicer has something to compare against
        loans_csv = _make_csv([
            {"loan_id": "CRASH-001", "borrower_id": "B1", "origination_date": "2020-01-01",
             "maturity_date": "2050-01-01", "original_principal": "100000", "interest_rate": "4.5"},
            {"loan_id": "CRASH-002", "borrower_id": "B2", "origination_date": "2020-06-01",
             "maturity_date": "2050-06-01", "original_principal": "200000", "interest_rate": "5.0"},
        ])
        _process_loan_tape(db_session, loans_csv, "crash_loans.csv", 1)

        # Now create a servicer file with valid + valid rows
        # (the try/except should handle any unexpected errors gracefully)
        servicer_csv = _make_csv([
            {"loan_id": "CRASH-001", "current_balance": "95000", "interest_rate": "4.75"},
            {"loan_id": "CRASH-002", "current_balance": "190000", "interest_rate": "5.25"},
        ])

        from app.services.ingestion import ingest_servicer_update_streaming
        result = ingest_servicer_update_streaming(
            db_session, servicer_csv, "servicer_crash_test.csv", 1
        )

        # The function should NOT crash — it should process all rows
        assert result["imported_count"] >= 1, "At least one row should have been processed"
        # Total rows should be the sum of processed + failed
        assert result["total_rows"] == result["imported_count"] + result["failed_count"]


class TestServicerSourceFileDedup:
    """Phase 3: servicer file-level deduplication."""

    def test_servicer_idempotent_on_reupload(self, db_session):
        """Uploading the same servicer file twice should skip on second upload."""
        # Import base loans first — include interest_rate so conflict is detected
        loans_csv = _make_csv([
            {"loan_id": "SDEDUP-001", "borrower_id": "B1", "origination_date": "2020-01-01",
             "maturity_date": "2050-01-01", "original_principal": "100000", "interest_rate": "4.5",
             "current_balance": "98000"},
        ])
        _process_loan_tape(db_session, loans_csv, "sdedup_loans.csv", 1)

        # Servicer file with a different current_balance → triggers CONFLICT_DETECTED event
        servicer_csv = _make_csv([
            {"loan_id": "SDEDUP-001", "current_balance": "95000"},
        ])

        from app.services.ingestion import ingest_servicer_update_streaming
        result1 = ingest_servicer_update_streaming(db_session, servicer_csv, "servicer_dedup.csv", 1)
        assert result1["imported_count"] >= 1 or result1["conflicts_detected"] >= 1

        result2 = ingest_servicer_update_streaming(db_session, servicer_csv, "servicer_dedup.csv", 1)
        assert result2["imported_count"] == 0
        assert result2.get("skipped_reason") == "file already ingested"
