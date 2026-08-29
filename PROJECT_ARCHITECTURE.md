# Loan Data Verification Copilot – Architecture & Master Plan

## 1. High-Level Flow (The Lifecycle of a Loan Record)
The application leverages an **Event-Sourced** architecture rather than a traditional CRUD design. This guarantees that all state changes are auditable and tamper-proof.

1. **Ingestion (CSV Upload):** 
   - A `loan_tape.csv` file is uploaded via the `/ingest/upload` endpoint.
   - The data is parsed, column aliases are mapped, and numeric/date fields are sanitized.
   - A `LOAN_IMPORTED` event is appended to the ledger for each row.
2. **Multi-Source Reconciliation:**
   - Subsequent uploads (`servicer_update.csv`, `document_manifest.csv`) are cross-referenced against the current projected state.
   - Discrepancies emit `CONFLICT_DETECTED` or `DOCUMENT_MISSING` events.
3. **Automated Validation:**
   - Both hardcoded rules (e.g. invalid dates, negative balances) and dynamic AI-generated rules are executed.
   - Failures emit `VALIDATION_FAILED` events and spawn `ExceptionRecord` entries in the database.
4. **Exception Queue & AI Sandbox:**
   - Data Reviewers are presented with the exceptions.
   - They can request AI analysis, which returns an `AISuggestion` containing a JSON patch.
   - The system is designed as an "AI Sandbox": the AI only **proposes** patches; it cannot write to the database directly.
5. **Human Resolution:**
   - The Data Reviewer must explicitly apply the AI's patch or provide a manual correction.
   - Upon resolution, an `AI_SUGGESTION_APPLIED` or `HUMAN_EDIT_APPLIED` event is appended to the ledger.
6. **Data Time Travel & Cryptographic Integrity:**
   - The current state of any loan is dynamically computed by replaying its event chain (`project_loan_state()`).
   - Every event contains an `event_hash` that chains to the previous event (like a blockchain), ensuring tamper-evident storage.

## 2. Technology Stack & Database Schema

### Tech Stack
* **Frontend:** React, TypeScript, Tailwind CSS (styled to Intain's corporate identity)
* **Backend:** FastAPI (Python 3.10+)
* **Database:** SQLite (dev) / PostgreSQL (production) via SQLAlchemy
* **AI Integration:** Google Gemini (Simulated)

### Core Database Entities
* `User`: Stores user credentials and Role-Based Access Control (RBAC) levels (Admin, Operator, Reviewer, Consumer).
* `LoanEvent`: The immutable ledger table. Stores `loan_id`, `event_type`, `payload_json`, timestamp, and the `event_hash`.
* `ExceptionRecord`: A mutable operational table used to track the workflow of resolving validation errors.
* `ValidationRule`: Stores dynamically generated self-healing rules derived from previous human corrections.

## 3. The "AI Sandbox" Design
To ensure enterprise-grade safety, the AI is completely sandboxed:
1. **No Direct Writes:** The AI does not have database write access.
2. **Patch Generation:** It receives a subset of the loan data and generates a structured JSON patch.
3. **Human-in-the-Loop Validation:** The patch is temporarily stored in the `ExceptionRecord.ai_suggestion_json`. It only takes effect when a human Reviewer explicitly invokes the `/resolve` endpoint with `apply_ai_suggestion=true`.
4. **Self-Healing Loop:** When a human resolves an exception, the system analyzes the old vs. new values and generates a dynamic `ValidationRule` (Module D) to catch similar errors in future uploads.

## 4. Role-Based Access Control (RBAC)
The application enforces strict separation of duties via FastAPI dependencies (`require_role`) and React Router route guards.

* **Data Operator:** Can upload files and view ingestion logs. Cannot resolve exceptions.
* **Data Reviewer:** Can view the Exception Queue and apply patches. Cannot upload raw data.
* **Data Consumer:** Can only view the verified portfolio and cryptographic audit trails.
* **Master Admin:** Can view system-wide diagnostics, manage all users, and view aggregated dashboards.
