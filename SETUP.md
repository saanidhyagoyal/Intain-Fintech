# Setup Guide: Loan Data Verification Copilot

This guide outlines the steps to set up and run the Loan Data Verification Copilot on a fresh machine.

## Prerequisites
* **Python 3.10+**
* **Node.js 18+**
* **npm** or **yarn**

## 1. Backend Setup (FastAPI)

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows use: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
   *(If `requirements.txt` is missing, install the core dependencies manually: `pip install fastapi uvicorn sqlalchemy pydantic python-multipart python-jose passlib bcrypt`)*

4. **Initialize the Database & Start the Server:**
   The SQLite database (`loan_copilot.db`) will be automatically created on startup.
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
   The backend API will be available at `http://localhost:8000/api`. The interactive Swagger documentation will be at `http://localhost:8000/docs`.

## 2. Frontend Setup (React/Tailwind)

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   The frontend will be available at `http://localhost:5173`.

## 3. Demo Credentials
The system initializes with four mock users, one for each role:
* **Master Admin:** `admin` / `admin123`
* **Data Operator:** `operator` / `operator123`
* **Data Reviewer:** `reviewer` / `reviewer123`
* **Data Consumer:** `consumer` / `consumer123`

## 4. End-to-End Testing (Optional)
To verify the entire event-sourced architecture and ingestion pipeline, run the comprehensive E2E test script located in the root directory:
```bash
# Ensure the backend server is running on port 8000
source backend/venv/bin/activate
python3 test_e2e_pipeline.py
```
