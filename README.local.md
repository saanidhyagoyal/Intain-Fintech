# Loan Data Verification Copilot

An enterprise-grade FinTech platform that ingests messy loan CSV records, detects data-quality issues using a configurable rule engine, leverages AI (Gemini/Anthropic) to suggest fixes, and produces cryptographically-verified canonical loan records — all built on an **Event Sourcing** architecture with a **Self-Healing Validation Pipeline**.

---

## 🏗 Architecture Highlights

- **Event Sourcing**: No `UPDATE` on loan records. Every change is an immutable event. Current state is computed by replaying events.
- **Data Time Travel**: Reconstruct any loan's state at any past timestamp via `POST /api/audit/rewind`.
- **Self-Healing Pipeline**: When reviewers apply the same manual fix 3+ times, the system synthesizes a new automated validation rule.
- **AI Sandbox**: AI suggestions are stored separately and NEVER auto-applied. Requires explicit human approval via `PATCH /api/exceptions/:id/resolve`.
- **Cryptographic Integrity**: SHA-256 chained hashes on events and canonical verified records.

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- npm 9+

### 1. Clone & Setup Environment

```bash
# Clone the repository
cd Intain

# Create .env file (if not already present)
cat <<EOF > .env
DATABASE_URL=sqlite:///./loan_copilot.db
GEMINI_API_KEY=your_gemini_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
SECRET_KEY=dev_secret_key_12345
EOF
```

### 2. Backend Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Start the API server
uvicorn main:app --reload --port 8000
```

The API is available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### 3. Frontend Setup

```bash
cd frontend
npm install

# Start the dev server (proxies /api to backend)
npm run dev
```

The UI is available at `http://localhost:5173`.

### 4. Default Credentials

| Username   | Password      | Role            |
|-----------|---------------|-----------------|
| operator  | operator123   | DATA_OPERATOR   |
| reviewer  | reviewer123   | REVIEWER        |
| consumer  | consumer123   | DATA_CONSUMER   |

---

## 📂 Project Structure

```
Intain/
├── .env                          # Environment variables
├── backend/
│   ├── main.py                   # FastAPI entry point
│   ├── requirements.txt          # Python dependencies
│   └── app/
│       ├── core/                 # Config, database, security, crypto
│       ├── models/               # SQLAlchemy ORM entities
│       ├── schemas/              # Pydantic DTOs
│       ├── services/             # Business logic layer
│       └── api/v1/               # FastAPI routers
└── frontend/
    ├── src/
    │   ├── api/                  # Axios HTTP client
    │   ├── components/           # Reusable UI components
    │   ├── pages/                # Role-based dashboards
    │   └── types/                # TypeScript interfaces
    └── package.json
```

---

## 🔌 API Endpoints

### Module H — Required Endpoints

| Method  | Path                            | Description                         |
|---------|--------------------------------|-------------------------------------|
| GET     | `/api/loans`                   | List all loans (projected state)    |
| GET     | `/api/loans/:id`               | Single loan with events & exceptions|
| GET     | `/api/exceptions`              | List exceptions (filterable)        |
| GET     | `/api/verified-loans`          | List verified loans                 |
| GET     | `/api/verified-loans/:id`      | Single verified loan with hash      |
| GET     | `/api/audit/:loanId`           | Full audit trail                    |
| GET     | `/api/summary`                 | Dashboard aggregates                |

### Additional Endpoints

| Method  | Path                                  | Description                              |
|---------|--------------------------------------|------------------------------------------|
| POST    | `/api/ingest/upload`                 | Upload CSV (loan_tape/servicer/manifest) |
| POST    | `/api/loans/:id/verify`             | Mark loan as verified                    |
| PATCH   | `/api/exceptions/:id/resolve`       | Resolve exception (manual or AI)         |
| POST    | `/api/ai/explain/:id`               | Get AI explanation for exception         |
| POST    | `/api/ai/suggest-rule`              | Trigger self-healing rule synthesis      |
| POST    | `/api/audit/rewind`                 | Time-travel: rebuild state at timestamp  |
| GET     | `/api/verified-loans/export`        | Export verified loans as CSV             |
| POST    | `/api/auth/login`                   | Mock JWT login                           |
| GET     | `/api/auth/me`                      | Current user info                        |

---

## 🔐 Environment Variables

| Variable          | Required | Description                          |
|-------------------|----------|--------------------------------------|
| `DATABASE_URL`    | Yes      | SQLAlchemy connection string         |
| `GEMINI_API_KEY`  | No       | Google Gemini API key for AI         |
| `ANTHROPIC_API_KEY`| No      | Anthropic Claude API key for AI      |
| `SECRET_KEY`      | Yes      | JWT signing secret                   |

> **Note**: If AI keys are not configured, the system falls back to intelligent mock responses.
