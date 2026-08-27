# Architecture — Loan Data Verification Copilot

## 1. Event Sourcing ("Data Time Travel")

### Design

The core loan data layer is built on an **event-sourced architecture**. This means:

- **No `UPDATE` or `DELETE`** is ever performed on loan records.
- Every change is stored as an **immutable event** in the `loan_events` table.
- The "current state" of any loan is computed dynamically by **replaying its event sequence**.

### Event Types

```
LOAN_IMPORTED          → Raw CSV row ingested
VALIDATION_FAILED      → Rule engine flagged an issue
AI_PATCH_SUGGESTED     → LLM generated a fix suggestion
HUMAN_EDIT_APPLIED     → Reviewer manually corrected a field
AI_SUGGESTION_APPLIED  → Reviewer accepted an AI suggestion
LOAN_VERIFIED          → Loan marked as canonical verified record
CONFLICT_DETECTED      → Servicer update conflicted with loan tape
DOCUMENT_MISSING       → Document manifest found missing docs
RULE_GENERATED         → Self-healing pipeline created a new rule
```

### How Projection Works

```
┌──────────────────────────────────────────────────────┐
│                   loan_events table                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ IMPORTED │→ │ VALIDATE │→ │ AI_PATCH │→ ...       │
│  │ payload  │  │ payload  │  │ payload  │            │
│  └──────────┘  └──────────┘  └──────────┘           │
│                                                      │
│  project_loan_state(loan_id, up_to=timestamp)        │
│  ════════════════════════════════════════════         │
│  Replays events chronologically, applying each       │
│  event's payload to build the current state dict.    │
│                                                      │
│  If `up_to` is specified, only events before that    │
│  timestamp are replayed (Data Time Travel).          │
└──────────────────────────────────────────────────────┘
```

### Tamper-Evident Chain

Each event stores a `event_hash` computed as:

```
SHA-256( canonical_json(payload) + previous_event_hash )
```

This creates a tamper-evident chain. If any event is modified or deleted, `verify_hash_chain(loan_id)` returns `False`.

### Time Travel Endpoint

```
POST /api/audit/rewind
Body: { "loan_id": "L-001", "target_timestamp": "2024-06-15T12:00:00Z" }
```

Returns the loan state as it existed at that timestamp — proving instantaneous recovery from bad approvals.

---

## 2. Self-Healing Validation Pipeline

### Problem

Manual data correction is expensive. If a reviewer corrects the same type of error repeatedly (e.g., mapping "FL" → "Florida"), that pattern should be automated.

### Design

```
┌─────────────────┐     ┌────────────────────┐     ┌──────────────────┐
│  HUMAN_EDIT     │     │  Pattern Detection  │     │  AI Rule         │
│  APPLIED events │ ──→ │  (3+ occurrences)   │ ──→ │  Synthesis       │
│  in audit log   │     │  by field + values  │     │  (LLM call)      │
└─────────────────┘     └────────────────────┘     └──────────────────┘
                                                           │
                                                    ┌──────▼──────────┐
                                                    │  New            │
                                                    │  ValidationRule │
                                                    │  (inactive)     │
                                                    └─────────────────┘
```

### Flow

1. Reviewer resolves exceptions manually (HUMAN_EDIT_APPLIED events accumulate)
2. `detect_recurring_patterns()` scans for fields with 3+ identical corrections
3. `synthesize_rule()` calls the LLM to generate a `ValidationRule` JSON
4. The rule is stored as `AI_GENERATED`, `is_active=False` (requires approval)
5. Once activated, future ingestion runs apply the rule automatically

### Rule JSON Format

```json
{
  "rule_name": "auto_fix_borrower_state_mapping",
  "field_name": "borrower_state",
  "transformation_json": {"map": {"FL": "Florida", "CA": "California"}},
  "error_message": "State abbreviation should be full name",
  "severity": "MEDIUM"
}
```

---

## 3. Cryptographic Hashing

### Verified Record Hash

When a loan is verified, a SHA-256 hash is computed over the **canonicalized JSON** of all 21 loan fields:

```python
canonical = json.dumps(loan_fields, sort_keys=True, separators=(',', ':'))
record_hash = hashlib.sha256(canonical.encode()).hexdigest()
```

This hash is stored in the LOAN_VERIFIED event payload and displayed in the Data Consumer dashboard, enabling:

- **Integrity verification**: Any downstream system can recompute the hash and compare.
- **Regulatory compliance**: Provable data lineage from raw CSV to verified record.

---

## 4. AI Sandbox Controls

The AI assistant is strictly sandboxed:

| Control | Implementation |
|---------|---------------|
| **Never auto-apply** | AI suggestions stored as `ai_suggestion_json` on ExceptionRecord, never written to event store |
| **Explicit approval** | Only `PATCH /exceptions/:id/resolve` with `apply_ai_suggestion=true` triggers `AI_SUGGESTION_APPLIED` event |
| **Full provenance** | Every AI response includes: `model_name`, `prompt_used`, `generated_at`, `confidence` |
| **Audit trail** | `AI_PATCH_SUGGESTED` event logged when AI generates a suggestion |

---

## 5. Multi-Source Conflict Detection

The ingestion service supports three CSV types:

| Source | Event | Behavior |
|--------|-------|----------|
| `loan_tape.csv` | `LOAN_IMPORTED` | Primary data source |
| `servicer_update.csv` | `CONFLICT_DETECTED` | Compares against existing state, flags differences |
| `document_manifest.csv` | `DOCUMENT_MISSING` | Cross-references documents, flags missing/incomplete |

Conflicts create `ExceptionRecord` entries with severity `HIGH` for reviewer attention.
