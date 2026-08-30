# Loan Data Verification Copilot

An enterprise-grade, event-sourced verification platform that ingests messy loan records, detects data-quality issues, uses AI to resolve exceptions, and produces a cryptographically signed verified dataset.

Built for the **Intain Campus FinTech Challenge 2026 | Full Stack Track**.

## Features
- **Event-Sourced Architecture:** Every edit is tracked in an immutable `loan_events` ledger.
- **Role-Based Workflows:** Distinct UI panels for Data Operators, Reviewers, and Data Consumers.
- **Hardened Ingestion:** Streaming CSV parsers with idempotency guards.
- **AI Copilot:** Explains exceptions, suggests patches, and creates dynamic validation rules.
- **Cryptographic Audit:** SHA-256 hashed lineage for guaranteed data integrity.

## Prerequisites
- Node.js (v18+)
- Python (3.11+)
- Make sure `pip` is available.

## Quick Setup (Local Development)

### 1. Backend Setup
Navigate to the `backend` directory:
```bash
cd backend
```
Create a virtual environment and install dependencies:
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```
Run the FastAPI backend server:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend Setup
Open a new terminal tab and navigate to the `frontend` directory:
```bash
cd frontend
```
Install dependencies and start the Vite dev server:
```bash
npm install
npm run dev
```

## Default Test Credentials
The database automatically seeds 4 users on startup:

1. **Master Admin:** `admin@intain.io` / `admin123`
2. **Data Operator:** `operator@intain.io` / `operator123`
3. **Reviewer:** `reviewer@intain.io` / `reviewer123`
4. **Data Consumer:** `consumer@intain.io` / `consumer123`

## Documentation Deliverables
The problem statement required documentation can be found in the root directory:
- [ARCHITECTURE.md](./ARCHITECTURE.md): System design, API, data model, and trade-offs.
- [AI_DEVELOPMENT_LOG.md](./AI_DEVELOPMENT_LOG.md): Evidence of agentic coding, prompts, and human review loop.
