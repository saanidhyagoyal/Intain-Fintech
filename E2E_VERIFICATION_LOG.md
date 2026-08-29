# E2E Verification Log — Intain Loan Data Verification Copilot

**Date:** 2026-08-29  
**Author:** Automated QA Pipeline  
**Backend:** FastAPI + SQLAlchemy + SQLite (WAL mode)  
**Frontend:** React 19 + Vite + TailwindCSS  

---

## 1. Phase 1: Automated Database Reset

### Implementation
Added `RESET_DB_ON_STARTUP` boolean flag to [`config.py`](backend/app/core/config.py) (default `False`).  
When `True`, the [`main.py`](backend/main.py) lifespan executes `Base.metadata.drop_all()` before `create_all()`, giving a completely fresh database on every server restart.

### Verification
```
$ RESET_DB_ON_STARTUP=true uvicorn main:app --port 8000
🗑️ Database reset: all tables dropped (RESET_DB_ON_STARTUP=True)
CREATE TABLE users (...)
CREATE TABLE loan_events (...)
CREATE TABLE exception_records (...)
CREATE TABLE validation_rules (...)
INSERT INTO users ... (4 seed users created)

📊 Pre-test state: 0 loans  ✅
```

---

## 2. Phase 2: Negative Math Fix — Root Cause & Resolution

### Root Cause
The frontend [`OperatorDash.tsx`](frontend/src/pages/OperatorDash.tsx) calculated:
```ts
const cleanRows = summary.total_loans - (summary.exceptions_by_status?.OPEN || 0);
```
This subtracted the **total count of OPEN exception records** (12,799) from total loans (9,999), producing **-2,800**.

One loan can have 3+ exceptions (negative balance, missing document, stale data), so the raw OPEN count vastly exceeds the loan count.

### Fix Applied

| File | Change |
|------|--------|
| `schemas/audit.py` | Added `clean_rows` and `loans_with_open_exceptions` fields to `SummaryResponse` |
| `api/v1/summary.py` | Computes `clean_rows = max(0, total_loans - COUNT(DISTINCT loan_id WHERE status != RESOLVED))` server-side |
| `api/v1/summary.py` | Added zero-division guard: `if total_loans > 0 else 100.0` for `data_quality_score` |
| `OperatorDash.tsx` | Uses `summary.clean_rows` from server (both line 11 and 179) |
| `types/index.ts` | Added `clean_rows` and `loans_with_open_exceptions` to TypeScript interface |

### Verification
```
✅ PASS: clean_rows is non-negative after all uploads (305)
✅ PASS: data_quality_score is non-negative (3.0)
```

**Before fix:** `cleanRows = 9,999 - 12,799 = -2,800`  
**After fix:** `clean_rows = 9,999 - 9,694 = 305` (305 loans have zero open exceptions)

---

## 3. Phase 3: Parser Crash Guards & Manifest Hardening

### Changes Applied

| File | Change | Status |
|------|--------|--------|
| `ingestion.py` — servicer streaming | Added `try/except Exception` around row body (lines 676-730) | ✅ |
| `ingestion.py` — manifest streaming | Added `try/except Exception` around row body (lines 755-810) | ✅ |
| `ingestion.py` — servicer streaming | Added source-file dedup guard (checks for existing events with same `source_file`) | ✅ |
| `ingestion.py` — manifest streaming | Extracts and stores `custody_audit_date` in event payload | ✅ |
| `ingestion.py` — all parsers | Currency stripping (`$`, `,`, `USD`), rate stripping (`%`), null sentinels | ✅ (prior) |
| `ingestion.py` — header aliases | `custodian_vault_id`, `custody_audit_date` mapped | ✅ (prior) |

### Crash Recovery Test
```
tests/test_ingestion.py::TestServicerCrashRecovery::test_servicer_recovers_from_bad_row PASSED
```

---

## 4. Phase 4: Test Suite Results

### Backend Unit Tests (`backend/tests/`)

```
============================= test session starts ==============================
tests/test_api.py::TestAuthLogin::test_login_valid_credentials PASSED
tests/test_api.py::TestAuthLogin::test_login_invalid_password PASSED
tests/test_api.py::TestAuthLogin::test_login_nonexistent_user PASSED
tests/test_api.py::TestUploadGuards::test_upload_non_csv_rejected PASSED
tests/test_api.py::TestUploadGuards::test_upload_without_auth_falls_back_to_dev_mode PASSED
tests/test_api.py::TestSummaryEndpoint::test_summary_returns_valid_json PASSED
tests/test_api.py::TestExceptionsEndpoint::test_exceptions_list_returns_valid_json PASSED
tests/test_api.py::TestSummaryCleanRows::test_summary_clean_rows_non_negative PASSED
tests/test_api.py::TestSummaryCleanRows::test_summary_zero_division_safe_on_empty_db PASSED
tests/test_ingestion.py::TestLoanTapeBasicImport::test_imports_correct_count PASSED
tests/test_ingestion.py::TestLoanTapeDuplicateUpload::test_idempotent_on_reupload PASSED
tests/test_ingestion.py::TestNegativeBalanceFlagged::test_negative_principal_creates_exception PASSED
tests/test_ingestion.py::TestBadDateFlagged::test_maturity_before_origination PASSED
tests/test_ingestion.py::TestEmptyCsv::test_empty_file_no_crash PASSED
tests/test_ingestion.py::TestBlankRowsSkipped::test_blank_rows_filtered PASSED
tests/test_ingestion.py::TestDocumentManifestDedup::test_manifest_idempotent PASSED
tests/test_ingestion.py::TestServicerCrashRecovery::test_servicer_recovers_from_bad_row PASSED
tests/test_ingestion.py::TestServicerSourceFileDedup::test_servicer_idempotent_on_reupload PASSED
============================== 18 passed in 0.28s ==============================
```

### Frontend Component Tests (`frontend/src/__tests__/`)

```
✓ OperatorDash renders without crashing     71ms
✓ ReviewerDash renders without crashing     12ms
✓ ConsumerDash renders without crashing     18ms

Test Files  1 passed (1)
     Tests  3 passed (3)
  Duration  1.82s
```

---

## 5. Phase 5: E2E Lifecycle Flow Results

### Flow: Operator → Reviewer → Consumer

```
================================================================
  PHASE 1: Operator Flow
================================================================
📁 loan_tape.csv    → Imported: 9,999 | Exceptions: 600
📁 loan_tape.csv    → Imported: 0     (idempotent ✅)
📁 servicer_update  → Imported: 9,800 | Conflicts: 9,733
📁 document_manifest→ Imported: 10,000| Exceptions: 533
📁 document_manifest→ Imported: 0     (idempotent ✅)
📊 clean_rows = 305 (non-negative ✅)
📊 data_quality_score = 3.0 (safe ✅)

================================================================
  PHASE 2: Reviewer Flow
================================================================
📊 Open exceptions: 12,799
🤖 AI suggestion: mock-fallback (confidence: 0.75) ✅
✅ Exception #12799 resolved → RESOLVED
✅ Loan F26Q1761072 verified (all exceptions resolved)

================================================================
  PHASE 3: Consumer Flow
================================================================
✅ Verified loans ledger: 1 loan
✅ Record hash: c0a88b0507fa98e8... (SHA-256 ✅)
✅ Hash chain integrity: VERIFIED ✓
```

### Final Score
```
Tests Run:    16
✅ Passed:    16
❌ Failed:    0
⏱️  Duration:  126.8s

🎉 ALL TESTS PASSED — Full lifecycle verified!
```

---

## 6. Corner Case Checklist

| # | Corner Case | Source Type | Expected Behavior | Result |
|---|-------------|-------------|-------------------|--------|
| 1 | Duplicate loan_tape upload | loan_tape | `imported_count = 0` | ✅ |
| 2 | Duplicate document_manifest upload | document_manifest | `imported_count = 0` | ✅ |
| 3 | Duplicate servicer_update upload | servicer_update | `imported_count = 0` | ✅ |
| 4 | Empty CSV (header only) | loan_tape | No crash, 0 imports | ✅ |
| 5 | Blank rows in CSV | loan_tape | Skipped, valid rows imported | ✅ |
| 6 | Non-CSV file upload | any | HTTP 400 | ✅ |
| 7 | Negative `original_principal` | loan_tape | CRITICAL exception | ✅ |
| 8 | Maturity before origination | loan_tape | CRITICAL exception | ✅ |
| 9 | No auth token (dev mode) | any | Falls back to operator | ✅ |
| 10 | Empty DB → GET /api/summary | — | No ZeroDivisionError | ✅ |
| 11 | clean_rows after exceptions | loan_tape | `>= 0`, never negative | ✅ |
| 12 | AI explain without API key | — | Mock fallback with patch | ✅ |

---

## How to Run All Tests

```bash
# Backend unit tests (18 tests)
cd backend && ./venv/bin/python -m pytest tests/ -v

# Frontend component tests (3 tests)
cd frontend && npx vitest run --reporter=verbose

# E2E lifecycle test (16 assertions, requires backend on localhost:8000)
# Start fresh:
cd backend && RESET_DB_ON_STARTUP=true uvicorn main:app --port 8000
# In another terminal:
./backend/venv/bin/python tests/test_e2e_flow.py
```
