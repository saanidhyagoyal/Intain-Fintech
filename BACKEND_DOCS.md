# Intain Copilot - Backend Documentation

The backend is built with Python 3, FastAPI, and SQLAlchemy. It operates on an Event-Sourced architecture to ensure absolute data traceability.

## 1. Database Schema

The system uses SQLAlchemy ORM to manage the SQLite/PostgreSQL database.

### `User`
Manages authentication and role-based access.
*   `id`: Primary key.
*   `username`, `email`, `hashed_password`: Authentication fields.
*   `role`: Enum (`ADMIN`, `DATA_OPERATOR`, `REVIEWER`, `DATA_CONSUMER`).

### `LoanEvent` (The Ledger)
The immutable heart of the system.
*   `id`: Primary key.
*   `loan_id`: String identifier linking the event to a specific loan.
*   `event_type`: Enum (`LOAN_IMPORTED`, `VALIDATION_FAILED`, `HUMAN_EDIT_APPLIED`, `AI_SUGGESTION_APPLIED`, `LOAN_VERIFIED`, etc.).
*   `payload`: JSON blob containing the delta data (the specific fields changed).
*   `timestamp`: Chronological marker.
*   `user_id`: Foreign key to `User` (who made the change).
*   `event_hash`: Cryptographic SHA-256 hash.
    *   *Hash Logic:* `hash(previous_event_hash + payload + timestamp + user_id)`. Ensures the ledger cannot be tampered with retroactively.
*   `source_file`: Metadata linking back to the uploaded CSV.

### `ExceptionRecord`
Tracks failed validations.
*   `id`: Primary key.
*   `loan_id`: Foreign key to the loan.
*   `field_name`, `expected_value`, `actual_value`: The exact failure details.
*   `severity`: Enum (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`).
*   `status`: Enum (`OPEN`, `IN_REVIEW`, `RESOLVED`).
*   `resolution_type`: How it was fixed (e.g., `MANUAL`, `AI_ACCEPTED`).

### `ValidationRule`
Stores dynamic, self-healing rules.
*   `id`: Primary key.
*   `rule_name`, `field_name`: Target definitions.
*   `condition_json`, `transformation_json`: Logic for the rule.
*   `rule_type`: Enum (e.g., `SYSTEM`, `AI_GENERATED`).

## 2. API Contracts (Module H Compliance)

### Authentication
*   **`POST /api/auth/login`**: Accepts `username` and `password`. Returns a JWT `access_token` and the user's `role`.

### Ingestion (Module A)
*   **`POST /api/upload`**: Accepts a `multipart/form-data` file. Parses CSV, runs initial validation, and creates `LOAN_IMPORTED` and `VALIDATION_FAILED` events. Returns an `IngestionResult` mapping failures.

### Loans & Exceptions
*   **`GET /api/loans`**: Returns paginated list of projected `LoanState` objects (built by aggregating events).
*   **`GET /api/loans/{loan_id}`**: Returns the detailed `LoanState`, all `LoanEvent`s, and `ExceptionRecord`s for a specific loan.
*   **`GET /api/exceptions`**: Returns paginated `ExceptionRecord`s, filterable by status (used by the Reviewer Dashboard).
*   **`PATCH /api/exceptions/{id}/resolve`**: Resolves an exception. Accepts `apply_ai_suggestion` (boolean) and an optional `manual_patch` JSON. Appends the corresponding event to the ledger.

### Verified Vault
*   **`GET /api/verified-loans`**: Returns only loans that have a `LOAN_VERIFIED` event, ensuring the Data Consumer only sees immutable, clean data.

### Audit & Time Travel
*   **`POST /api/audit/rewind`**: Accepts `loan_id` and `target_timestamp`. The backend calculates the `projected_state` by applying all events *up to* the `target_timestamp`. Returns the historical state and the hash at that exact moment.

### AI Endpoints
*   **`POST /api/ai/explain/{exception_id}`**: Invokes the LLM to explain a failure and suggest a JSON patch.
*   **`POST /api/ai/suggest-rule`**: Triggers the self-healing analysis to generate a new `ValidationRule`.

## 3. AI Sandboxing Protocol
The `ai_assistant.py` service connects to Gemini (or Anthropic) but is strictly sandboxed.
1.  **Read-Only Context**: The AI is fed the `ExceptionRecord`, the current `projected_state` of the loan, and the schema definitions.
2.  **JSON Enforcement**: The prompt strictly demands a JSON output containing `suggested_patch`, `explanation`, and `confidence`. Pydantic structured parsing validates this output before it reaches the frontend.
3.  **Physical Restriction**: The AI service *cannot* write to the `LoanEvent` table. It can only return the suggestion to the API. A human MUST click "Accept AI Fix" in the frontend, which triggers a separate backend route that verifies the JWT and appends the event under the human's `user_id`.

## 4. Validation Engine Rules
The `ValidationEngine` currently enforces the following hardcoded business rules during the CSV parse:
*   **Required Fields**: `loan_id` and `borrower_id` must not be null.
*   **Financial Sanity**: `current_balance` cannot be negative.
*   **Temporal Logic**: `maturity_date` must be strictly greater than the `origination_date`.
*   **Status Constraints**: `payment_status` must be a known valid enum (e.g., 'Current', 'Late', 'Default').
