# AI Development Log (Agentic Coding)

## 1. Overview
This project was entirely built using **Antigravity (AGY)**, an advanced agentic coding assistant developed by Google DeepMind. The AI was given end-to-end autonomy to design the architecture, implement the backend/frontend, handle complex file ingestion (CSV streaming), create the React components, and write automated tests.

## 2. Tools Used
- **Agent:** Antigravity (AGY)
- **Model:** Gemini-backed coding agent
- **Environment:** Antigravity IDE (VS Code extension) with terminal and filesystem tool access.

## 3. Use Cases
- **Architecture & System Design:** The AI proposed and implemented the Event-Sourcing pattern to solve the traceability requirement.
- **Backend API & Schema:** Wrote the SQLAlchemy schemas, Pydantic models, and FastAPI routes.
- **Validation Engine:** Designed the dynamic rule execution logic.
- **Frontend & UI:** Generated complex Tailwind CSS React components (Dashboards, Exception Queue).
- **Data Ingestion:** Handled streaming CSV ingestion with strict idempotency and sequence guards.
- **Testing:** Wrote `pytest` suites to verify zero-division boundaries and edge cases.

## 4. Human Review Process
The human developer (User) acted as the **Product Manager and DevOps lead**:
1. **Prompting & Feedback:** The user provided the initial PDF requirements, followed by iterative feedback (e.g., "the timestamp is showing up in local time instead of UTC").
2. **Review:** The agent generated `implementation_plan.md` artifacts before executing large refactors. The human reviewed the plan, pointed out edge cases (e.g., divide-by-zero on empty DB), and clicked "Approve".
3. **Execution:** The AI executed the plan, editing multiple files autonomously using its tool capabilities.

## 5. What Was Rejected (Agent Correction Examples)
1. **Initial Aggregation Logic:** The AI initially attempted to calculate the dashboard record count by querying `ExceptionRecord` instead of `LoanEvent`. The human rejected this output because perfectly valid rows (with no exceptions) were missing from the UI. The AI corrected itself by emitting a new `FILE_UPLOADED` event.
2. **Upload Sequencing:** The AI originally allowed uploading `servicer_update.csv` before `loan_tape.csv`. The human realized this caused conflicts and instructed the AI to build a sequence guard to reject secondary files. The AI successfully implemented the guard.

## 6. Representative Prompts
* "Output a phased Implementation Plan. Wait for my approval before executing. Phase 1: Fix the Negative Math & Calculation Bugs. Currently, the dashboard shows negative clean rows because it subtracts total exception events from total loans."
* "Man 10k rows document manifested have it shows 533 why is it so? time also is cming wrong here rectify this as well"
* "Now check full that from this pdf are we implementing every single thing that is listed here ?properly? every module you see properly audit trails and all audit trails of every single details and all front end and backend"

## 7. Lessons Learned
- **Where AI helped most:** Building the tedious boilerplate (SQLAlchemy models, Tailwind UI layouts) and designing the complex Event Sourcing hash-chain logic.
- **Where Human Engineering Judgment was necessary:** Validating the strict business logic (e.g., enforcing that a loan tape MUST be uploaded before a servicer update) and catching logical edge cases (e.g., ensuring `total_loans == 0` didn't crash the Data Quality Score).

## 8. AI-Generated Code Percentage
**Estimate:** 98%
The human developer guided the high-level logic, reviewed plans, and performed QA, while the AI physically typed virtually all backend and frontend code.
