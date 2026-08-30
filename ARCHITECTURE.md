# Loan Data Verification Copilot – Architecture Note

## 1. System Design & Event Sourcing
The application diverges from traditional CRUD architectures by implementing an **Event-Sourced Ledger**. In financial loan verification, knowing *what* changed is as important as the current state.
- Every ingestion, validation failure, human edit, or AI suggestion is appended as an immutable event to the `loan_events` table.
- The canonical state of a loan is derived purely by replaying its event history.
- **Trade-off:** Querying the current state requires "projecting" the event stream, which is computationally heavier than reading a single row. However, this is mitigated by bulk-loading and caching in the backend, while providing perfect, tamper-proof auditability.

## 2. Data Model
- **LoanEvent:** The core ledger. Stores `loan_id`, `event_type` (e.g., `LOAN_IMPORTED`, `VALIDATION_FAILED`, `AI_PATCH_SUGGESTED`, `FILE_UPLOADED`), a JSON payload, timestamp, and a cryptographic `event_hash` (chained from the previous event).
- **ExceptionRecord:** A materialized view of open issues for the Reviewer Queue. Linked to the `loan_events` but optimized for fast querying by status and severity.
- **ValidationRule:** Stores both hardcoded business definitions and dynamic, AI-generated rules (Self-Healing Rules pipeline) as JSON schemas.
- **User:** Role-based access control (Admin, Data Operator, Reviewer, Data Consumer).

## 3. Validation Engine
The validation engine runs sequentially upon any state change:
1. **Hardcoded Module:** Checks standard constraints (Missing IDs, Invalid Dates, Negative Balances, Maturity > Origination).
2. **Idempotency & Sequence Guards:** Rejects secondary file uploads (servicer updates, manifests) if the primary loan tape hasn't been established. Skips duplicate row imports.
3. **Dynamic Module:** Evaluates the record against all active AI-generated rules stored in the DB, applying JSON-based logic operations (e.g., operator `gt`, `lt`, `in`).

## 4. AI Review Assistant (The Copilot)
The AI assistant is built into the Reviewer workflow. It receives the full projected loan state and the specific exception details.
- **Explanation & Suggestion:** It outputs a JSON response containing a human-readable `explanation` and a `patch` object (e.g., `{"current_balance": 15000}`).
- **Self-Healing Rules:** If the AI detects a repeating pattern of exceptions, it can generate a permanent validation rule (e.g., mapping state abbreviations to full names) to fix future ingestion automatically.
- **Trade-off:** LLMs can hallucinate. Therefore, the architecture strictly enforces that the AI *cannot* silently mutate data. All AI suggestions are presented to the Reviewer, who must manually click "Accept AI Suggestion", which logs an `AI_SUGGESTION_APPLIED` event with the reviewer's ID.

## 5. Cryptographic Audit Trail
When a Reviewer resolves all exceptions and clicks "Verify", a `LOAN_VERIFIED` event is appended. 
- The backend computes a SHA-256 hash of the canonical data fields.
- The Data Consumer dashboard features a "Verify Ledger Integrity" button that recalculates the hash chain for every event in a loan's history to cryptographically prove no data was tampered with in the database.

## 6. API Design (FastAPI)
The backend exposes RESTful endpoints grouped by domain:
- `/api/ingest/upload`: High-throughput, streaming CSV parsers that dispatch events directly to the DB.
- `/api/summary`: Aggregates the ledger to provide real-time portfolio metrics and data-quality scores.
- `/api/loans/:id`: Returns the projected state alongside the complete event lineage.
- `/api/verified-loans`: Dedicated endpoints for the Consumer role, including CSV export.
