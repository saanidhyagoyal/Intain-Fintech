# Intain Copilot - Project Setup Guide

Welcome to the Loan Data Verification Copilot! This guide provides step-by-step instructions to get the backend and frontend up and running on a fresh system.

## Prerequisites
Before you begin, ensure you have the following installed on your machine:
*   **Python 3.9+** (For the FastAPI backend)
*   **Node.js 18+ & npm** (For the React/Vite frontend)
*   **Git** (To clone the repository)

---

## 1. Clone the Repository

Open your terminal and clone the project:
```bash
git clone <your-repository-url>
cd Intain
```

---

## 2. Backend Setup (FastAPI)

The backend uses Python and requires a virtual environment to manage dependencies.

### Step 2.1: Create and Activate a Virtual Environment
Navigate to the backend directory and create a virtual environment:
```bash
cd backend
python -m venv venv
```

Activate the virtual environment:
*   **Mac/Linux:**
    ```bash
    source venv/bin/activate
    ```
*   **Windows:**
    ```bash
    venv\Scripts\activate
    ```

### Step 2.2: Install Dependencies
With the virtual environment activated, install the required Python packages:
```bash
pip install -r requirements.txt
```

### Step 2.3: Environment Variables
Create a `.env` file in the root `Intain/` directory (one level up from `backend/`) if it doesn't already exist. You must provide your own API keys for the Generative AI features to work.

```env
# Intain/.env
DATABASE_URL=sqlite:///./loan_copilot.db
GEMINI_API_KEY=your_gemini_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
SECRET_KEY=dev_secret_key_12345
```

### Step 2.4: Start the Backend Server
Run the FastAPI development server using Uvicorn. *(Ensure you are in the `backend/` directory and your virtual environment is active).*

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

> [!NOTE]
> Upon starting for the first time, the backend will automatically generate the `loan_copilot.db` SQLite database and seed it with the default demo users.

The backend is now running at: **http://localhost:8000**
API Documentation (Swagger UI) is available at: **http://localhost:8000/docs**

---

## 3. Frontend Setup (React + Vite)

Open a **new terminal window** (leave the backend running) and navigate to the frontend directory from the project root.

### Step 3.1: Install Node Modules
```bash
cd frontend
npm install
```

### Step 3.2: Start the Frontend Server
Start the Vite development server:
```bash
npm run dev
```

The frontend is now running at: **http://localhost:5173**

---

## 4. Using the Platform

Once both servers are running, open your browser and navigate to **http://localhost:5173**. 

You will be presented with the Enterprise Login screen. For demonstration purposes, you can use the **Quick Login** buttons at the bottom of the login card, or manually enter the following seeded credentials:

*   **Master Admin:** Username: `admin` | Password: `admin123`
*   **Data Operator:** Username: `operator` | Password: `operator123`
*   **Data Reviewer:** Username: `reviewer` | Password: `reviewer123`
*   **Data Consumer:** Username: `consumer` | Password: `consumer123`

### Next Steps:
Log in as the **Data Operator** (or Admin) to upload your first CSV file (`loan_tape.csv`) and begin the verification process!
