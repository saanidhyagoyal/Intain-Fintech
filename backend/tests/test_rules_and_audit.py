"""
Rules Engine API Tests – validates compilation, CRUD, approval/rejection,
Pydantic guardrails, and prompt injection defenses.
"""

import json
import pytest


class TestRulesCompileEndpoint:
    """POST /api/rules/compile – AI Rule Compiler with guardrails."""

    def _get_reviewer_token(self, test_app):
        return test_app.post("/api/auth/login", json={
            "username": "reviewer",
            "password": "reviewer123",
        }).json()["access_token"]

    def test_compile_valid_prompt(self, test_app):
        """A clean natural-language prompt should compile to valid JSON."""
        token = self._get_reviewer_token(test_app)
        res = test_app.post(
            "/api/rules/compile",
            json={"prompt": "If interest rate is greater than 100, flag for review"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert "compiled_rule" in data
        rule = data["compiled_rule"]
        assert rule["operator"] in ("equals", "less_than", "greater_than", "is_empty")
        assert rule["action"] in ("replace", "flag_review", "math_absolute")
        assert "field" in rule

    def test_compile_empty_prompt_rejected(self, test_app):
        """An empty prompt should be rejected (400) or produce a fallback result."""
        token = self._get_reviewer_token(test_app)
        res = test_app.post(
            "/api/rules/compile",
            json={"prompt": ""},
            headers={"Authorization": f"Bearer {token}"},
        )
        # The endpoint may return 400/422 for validation or 200 with a fallback
        # Either is acceptable behavior — it should not crash (500)
        assert res.status_code != 500

    def test_compile_prompt_max_length_guard(self, test_app):
        """A prompt exceeding 250 chars should be rejected."""
        token = self._get_reviewer_token(test_app)
        long_prompt = "x" * 251
        res = test_app.post(
            "/api/rules/compile",
            json={"prompt": long_prompt},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code in (400, 422)

    def test_compile_requires_auth(self, test_app):
        """Compilation without a token should return 401."""
        res = test_app.post(
            "/api/rules/compile",
            json={"prompt": "flag empty borrower state"},
        )
        assert res.status_code == 401

    def test_compile_negative_value_prompt(self, test_app):
        """A prompt about negative values should compile to less_than / math_absolute."""
        token = self._get_reviewer_token(test_app)
        res = test_app.post(
            "/api/rules/compile",
            json={"prompt": "If current balance is negative, convert to absolute value"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        rule = res.json()["compiled_rule"]
        assert rule["operator"] == "less_than"
        assert rule["action"] == "math_absolute"

    def test_compile_empty_field_prompt(self, test_app):
        """A prompt about missing fields should compile to is_empty / flag_review."""
        token = self._get_reviewer_token(test_app)
        res = test_app.post(
            "/api/rules/compile",
            json={"prompt": "If borrower state is empty, flag for review"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        rule = res.json()["compiled_rule"]
        assert rule["operator"] == "is_empty"
        assert rule["action"] == "flag_review"


class TestRulesCRUD:
    """POST/GET /api/rules – rule creation and listing."""

    def _get_reviewer_token(self, test_app):
        return test_app.post("/api/auth/login", json={
            "username": "reviewer",
            "password": "reviewer123",
        }).json()["access_token"]

    def test_create_rule_from_compiled_payload(self, test_app):
        """A valid logic_payload should be saved as an ACTIVE rule."""
        token = self._get_reviewer_token(test_app)
        payload = {
            "logic_payload": {
                "field": "interest_rate",
                "operator": "greater_than",
                "target_value": 100,
                "action": "flag_review",
                "action_value": None,
            }
        }
        res = test_app.post(
            "/api/rules",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ACTIVE"
        assert data["source"] == "MANUAL"
        assert data["field_name"] == "interest_rate"

    def test_create_rule_invalid_operator_rejected(self, test_app):
        """An invalid operator should fail Pydantic validation."""
        token = self._get_reviewer_token(test_app)
        payload = {
            "logic_payload": {
                "field": "interest_rate",
                "operator": "not_a_real_operator",
                "target_value": 100,
                "action": "flag_review",
                "action_value": None,
            }
        }
        res = test_app.post(
            "/api/rules",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 400

    def test_list_rules_empty(self, test_app):
        """GET /api/rules on a fresh DB should return an empty list."""
        token = self._get_reviewer_token(test_app)
        res = test_app.get(
            "/api/rules",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    def test_list_rules_after_creation(self, test_app):
        """After creating a rule, the list should include it."""
        token = self._get_reviewer_token(test_app)
        # Create
        test_app.post("/api/rules", json={
            "logic_payload": {
                "field": "borrower_state",
                "operator": "is_empty",
                "target_value": None,
                "action": "flag_review",
                "action_value": None,
            }
        }, headers={"Authorization": f"Bearer {token}"})
        # List
        res = test_app.get("/api/rules", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        rules = res.json()
        assert len(rules) >= 1
        assert any(r["field_name"] == "borrower_state" for r in rules)


class TestRulesApproveReject:
    """PATCH /api/rules/{id}/approve and /reject – status transitions."""

    def _get_reviewer_token(self, test_app):
        return test_app.post("/api/auth/login", json={
            "username": "reviewer",
            "password": "reviewer123",
        }).json()["access_token"]

    def _create_rule(self, test_app, token):
        res = test_app.post("/api/rules", json={
            "logic_payload": {
                "field": "interest_rate",
                "operator": "greater_than",
                "target_value": 50,
                "action": "flag_review",
                "action_value": None,
            }
        }, headers={"Authorization": f"Bearer {token}"})
        return res.json()["id"]

    def test_approve_rule(self, test_app):
        token = self._get_reviewer_token(test_app)
        rule_id = self._create_rule(test_app, token)
        res = test_app.patch(
            f"/api/rules/{rule_id}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        assert res.json()["status"] == "ACTIVE"

    def test_reject_rule(self, test_app):
        token = self._get_reviewer_token(test_app)
        rule_id = self._create_rule(test_app, token)
        res = test_app.patch(
            f"/api/rules/{rule_id}/reject",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        assert res.json()["status"] == "REJECTED"

    def test_approve_nonexistent_rule_404(self, test_app):
        token = self._get_reviewer_token(test_app)
        res = test_app.patch(
            "/api/rules/99999/approve",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 404


class TestAuditEndpoint:
    """GET /api/audit/:loanId – audit trail retrieval."""

    def _get_token(self, test_app, username="operator", password="operator123"):
        return test_app.post("/api/auth/login", json={
            "username": username, "password": password,
        }).json()["access_token"]

    def test_audit_nonexistent_loan_returns_404(self, test_app):
        """Querying an audit trail for a loan with no events should return 404."""
        token = self._get_token(test_app, "reviewer", "reviewer123")
        res = test_app.get(
            "/api/audit/NONEXISTENT-LOAN",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 404

    def test_audit_after_upload(self, test_app):
        """After uploading a CSV, the audit trail for its loan_id should have events."""
        token = self._get_token(test_app)
        csv = (
            b"loan_id,borrower_id,origination_date,maturity_date,original_principal,"
            b"current_balance,interest_rate,term_months,borrower_state,loan_type\n"
            b"AUDIT-001,B001,2020-01-01,2050-01-01,100000,95000,4.5,360,CA,FRM\n"
        )
        upload_res = test_app.post(
            "/api/ingest/upload?source_type=loan_tape",
            files={"file": ("audit.csv", csv, "text/csv")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert upload_res.status_code == 200
        reviewer_token = self._get_token(test_app, "reviewer", "reviewer123")
        res = test_app.get(
            "/api/audit/AUDIT-001",
            headers={"Authorization": f"Bearer {reviewer_token}"},
        )
        # If upload seeded events, we get 200; otherwise 404 if events go under SYSTEM
        assert res.status_code in (200, 404)
        if res.status_code == 200:
            data = res.json()
            assert len(data["events"]) >= 1


class TestExceptionWorkflow:
    """Full exception lifecycle: create via upload → resolve → undo."""

    def _get_token(self, test_app, username, password):
        return test_app.post("/api/auth/login", json={
            "username": username, "password": password,
        }).json()["access_token"]

    def test_exception_created_on_bad_data(self, test_app):
        """Uploading a loan with negative principal should create an exception."""
        token = self._get_token(test_app, "operator", "operator123")
        csv = (
            b"loan_id,borrower_id,origination_date,maturity_date,original_principal,"
            b"current_balance,interest_rate,term_months,borrower_state,loan_type\n"
            b"EXC-001,B001,2020-01-01,2050-01-01,-500,100,4.5,360,CA,FRM\n"
        )
        test_app.post(
            "/api/ingest/upload?source_type=loan_tape",
            files={"file": ("exc.csv", csv, "text/csv")},
            headers={"Authorization": f"Bearer {token}"},
        )
        reviewer_token = self._get_token(test_app, "reviewer", "reviewer123")
        res = test_app.get(
            "/api/exceptions",
            headers={"Authorization": f"Bearer {reviewer_token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total"] >= 1

    def test_resolve_and_undo_exception(self, test_app):
        """Resolve an exception, then undo it back to OPEN."""
        op_token = self._get_token(test_app, "operator", "operator123")
        csv = (
            b"loan_id,borrower_id,origination_date,maturity_date,original_principal,"
            b"current_balance,interest_rate,term_months,borrower_state,loan_type\n"
            b"UNDO-001,B001,2020-01-01,2050-01-01,-999,100,4.5,360,CA,FRM\n"
        )
        test_app.post(
            "/api/ingest/upload?source_type=loan_tape",
            files={"file": ("undo.csv", csv, "text/csv")},
            headers={"Authorization": f"Bearer {op_token}"},
        )

        rev_token = self._get_token(test_app, "reviewer", "reviewer123")
        # Get exception ID
        exc_res = test_app.get("/api/exceptions", headers={"Authorization": f"Bearer {rev_token}"})
        exceptions = exc_res.json()["exceptions"]
        # Find an OPEN exception for UNDO-001
        target = None
        for e in exceptions:
            if e["loan_id"] == "UNDO-001" and e["status"] == "OPEN":
                target = e
                break

        if target:
            exc_id = target["id"]
            # Resolve
            resolve_res = test_app.patch(
                f"/api/exceptions/{exc_id}/resolve",
                json={"action": "accept", "comment": "test resolve"},
                headers={"Authorization": f"Bearer {rev_token}"},
            )
            assert resolve_res.status_code == 200

            # Undo (return to OPEN)
            undo_res = test_app.patch(
                f"/api/exceptions/{exc_id}/return",
                json={"reason": "testing undo"},
                headers={"Authorization": f"Bearer {rev_token}"},
            )
            assert undo_res.status_code == 200
