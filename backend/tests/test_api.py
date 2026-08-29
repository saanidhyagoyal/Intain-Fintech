"""
API Endpoint Tests – validates auth, upload guards, and summary/exception endpoints.

Uses the FastAPI TestClient with a dependency-overridden in-memory DB session.
"""

import io
import json
import pytest


class TestAuthLogin:
    """POST /api/auth/login – valid and invalid credentials."""

    def test_login_valid_credentials(self, test_app):
        res = test_app.post("/api/auth/login", json={
            "username": "operator",
            "password": "operator123",
        })
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["username"] == "operator"
        assert data["role"] == "DATA_OPERATOR"

    def test_login_invalid_password(self, test_app):
        res = test_app.post("/api/auth/login", json={
            "username": "operator",
            "password": "wrong_password",
        })
        assert res.status_code == 401

    def test_login_nonexistent_user(self, test_app):
        res = test_app.post("/api/auth/login", json={
            "username": "ghostuser",
            "password": "anything",
        })
        assert res.status_code == 401


class TestUploadGuards:
    """POST /api/ingest/upload – file type and auth validation."""

    def _get_token(self, test_app, username="operator", password="operator123"):
        res = test_app.post("/api/auth/login", json={
            "username": username,
            "password": password,
        })
        return res.json()["access_token"]

    def test_upload_non_csv_rejected(self, test_app):
        token = self._get_token(test_app)
        res = test_app.post(
            "/api/ingest/upload?source_type=loan_tape",
            files={"file": ("data.txt", b"some text content", "text/plain")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 400
        assert "CSV" in res.json()["detail"]

    def test_upload_without_auth_falls_back_to_dev_mode(self, test_app):
        """In dev mode, missing auth falls back to default operator user."""
        res = test_app.post(
            "/api/ingest/upload?source_type=loan_tape",
            files={"file": ("data.csv", b"loan_id\n", "text/csv")},
        )
        # Dev mode: no auth → falls back to default operator → 200 OK
        assert res.status_code == 200


class TestSummaryEndpoint:
    """GET /api/summary – returns valid JSON with expected keys."""

    def test_summary_returns_valid_json(self, test_app):
        token = test_app.post("/api/auth/login", json={
            "username": "operator",
            "password": "operator123",
        }).json()["access_token"]

        res = test_app.get(
            "/api/summary",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert "total_loans" in data
        assert "total_events" in data


class TestExceptionsEndpoint:
    """GET /api/exceptions – returns valid paginated list."""

    def test_exceptions_list_returns_valid_json(self, test_app):
        token = test_app.post("/api/auth/login", json={
            "username": "reviewer",
            "password": "reviewer123",
        }).json()["access_token"]

        res = test_app.get(
            "/api/exceptions",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert "exceptions" in data
        assert "total" in data


class TestSummaryCleanRows:
    """Validate the Phase 2 negative math fix."""

    def _get_token(self, test_app, username="operator", password="operator123"):
        return test_app.post("/api/auth/login", json={
            "username": username, "password": password
        }).json()["access_token"]

    def test_summary_clean_rows_non_negative(self, test_app):
        """After uploading data with exceptions, clean_rows must be >= 0."""
        token = self._get_token(test_app)

        # Upload a small CSV that will generate exceptions (negative principal)
        csv_content = (
            b"loan_id,borrower_id,origination_date,maturity_date,original_principal,"
            b"current_balance,interest_rate,term_months,borrower_state,loan_type\n"
            b"MATH-001,B001,2020-01-01,2050-01-01,-500,100,4.5,360,CA,FRM\n"
            b"MATH-002,B002,2020-01-01,2050-01-01,100000,95000,4.5,360,NY,FRM\n"
            b"MATH-003,B003,2020-01-01,2050-01-01,-200,50,3.2,240,TX,ARM\n"
        )
        test_app.post(
            "/api/ingest/upload?source_type=loan_tape",
            files={"file": ("math_test.csv", csv_content, "text/csv")},
            headers={"Authorization": f"Bearer {token}"},
        )

        res = test_app.get("/api/summary", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()

        assert "clean_rows" in data
        assert data["clean_rows"] >= 0, f"clean_rows is negative: {data['clean_rows']}"
        assert data["clean_rows"] <= data["total_loans"]
        assert data["data_quality_score"] >= 0

    def test_summary_zero_division_safe_on_empty_db(self, test_app):
        """Summary endpoint must not crash when DB has 0 loans."""
        token = self._get_token(test_app)
        res = test_app.get("/api/summary", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        # On empty DB: clean_rows=0, quality=100.0 (no loans = no problems)
        assert data["clean_rows"] >= 0
        assert data["data_quality_score"] >= 0
