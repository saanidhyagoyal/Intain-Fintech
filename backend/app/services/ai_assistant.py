"""
AI Review Assistant – Sandboxed LLM integration for exception analysis.

CRITICAL AI CONTROLS (Section 9):
  - NEVER auto-applies changes to loan data
  - Every response includes model metadata (model_name, prompt, timestamp)
  - Suggestions are stored as separate payload objects
  - Changes require explicit PATCH from a human reviewer

Supports: Gemini (google-genai) and Anthropic (anthropic SDK).
Falls back to mock responses if API keys are invalid.
"""

import json
from datetime import datetime, timezone
from typing import Optional

from app.core.config import get_settings
from app.schemas.ai import AISuggestion

settings = get_settings()


def _build_explain_prompt(exception_data: dict, loan_state: dict) -> str:
    """Build the LLM prompt for explaining a validation failure."""
    return f"""You are a loan data quality analyst for an enterprise FinTech platform.

Analyze this data quality exception and provide:
1. A clear explanation of what went wrong
2. The likely root cause
3. A suggested fix as a JSON patch
4. A confidence score (0.0 to 1.0)
5. A severity assessment (CRITICAL, HIGH, MEDIUM, LOW)

EXCEPTION DETAILS:
- Loan ID: {exception_data.get('loan_id')}
- Rule Violated: {exception_data.get('rule_id')}
- Field: {exception_data.get('field_name')}
- Expected: {exception_data.get('expected_value')}
- Actual: {exception_data.get('actual_value')}
- Description: {exception_data.get('description')}

CURRENT LOAN STATE:
{json.dumps(loan_state, indent=2, default=str)}

Respond in this exact JSON format:
{{
  "explanation": "...",
  "suggested_patch": {{"field_name": "corrected_value"}},
  "confidence": 0.85,
  "severity_assessment": "HIGH"
}}

Only output valid JSON. No markdown, no code blocks."""


def _build_suggest_rule_prompt(pattern: dict) -> str:
    """Build the LLM prompt for synthesizing a new validation rule."""
    return f"""You are an enterprise data governance expert.

Analyze this recurring data correction pattern and synthesize a new automated validation/transformation rule.

PATTERN DETECTED:
- Field: {pattern.get('field_name')}
- Corrections applied {pattern.get('count', 0)} times
- Common transformations: {json.dumps(pattern.get('transformations', {}), default=str)}
- Example values: {json.dumps(pattern.get('examples', []), default=str)}

Generate a validation rule in this exact JSON format:
{{
  "rule_name": "auto_fix_<field>_<pattern>",
  "field_name": "{pattern.get('field_name')}",
  "condition_json": {{"operator": "in", "value": ["invalid_val1"]}},
  "transformation_json": {{"map": {{"wrong_value": "correct_value"}}}},
  "error_message": "...",
  "severity": "MEDIUM"
}}

Only output valid JSON. No markdown, no code blocks."""


async def explain_exception(
    exception_data: dict,
    loan_state: dict,
) -> AISuggestion:
    """
    Call LLM to explain a validation failure and suggest a fix.
    Returns an AISuggestion with full model metadata and agentic trace.
    """
    prompt = _build_explain_prompt(exception_data, loan_state)
    model_name = "mock-fallback"
    response_text = ""
    agentic_trace = []

    # ── Step 1: Prompt Construction ──
    agentic_trace.append({
        "step": "PROMPT_DISPATCHED",
        "label": "Prompt Construction",
        "content": prompt,
        "status": "OK",
    })

    # Try Gemini first, then Anthropic, then fall back to mock
    try:
        if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here":
            result = await _call_gemini(prompt)
            response_text = result["text"]
            model_name = result["model"]
        elif settings.ANTHROPIC_API_KEY and settings.ANTHROPIC_API_KEY != "your_anthropic_api_key_here":
            result = await _call_anthropic(prompt)
            response_text = result["text"]
            model_name = result["model"]
        else:
            result = _mock_response(exception_data, loan_state)
            response_text = json.dumps(result)
            model_name = "mock-fallback"
    except Exception as e:
        # Graceful degradation to mock
        result = _mock_response(exception_data, loan_state)
        response_text = json.dumps(result)
        model_name = f"mock-fallback (error: {str(e)[:100]})"

    # ── Step 2: Raw LLM Response ──
    agentic_trace.append({
        "step": "RAW_LLM_RESPONSE",
        "label": "Raw LLM Output",
        "content": response_text,
        "status": "OK",
    })

    # ── Step 3: Guardrail Validation ──
    guardrail_checks = []
    json_valid = False
    try:
        parsed = json.loads(response_text)
        json_valid = True
        guardrail_checks.append("✓ JSON syntax valid")
    except json.JSONDecodeError:
        parsed = _mock_response(exception_data, loan_state)
        guardrail_checks.append("✗ JSON syntax INVALID — fell back to mock")

    # Schema validation
    has_explanation = "explanation" in parsed
    has_patch = "suggested_patch" in parsed
    has_confidence = "confidence" in parsed
    guardrail_checks.append(f"{'✓' if has_explanation else '✗'} explanation field present")
    guardrail_checks.append(f"{'✓' if has_patch else '✗'} suggested_patch field present")
    guardrail_checks.append(f"{'✓' if has_confidence else '✗'} confidence field present")

    # Hallucination guard: check patch only references known loan fields
    patch_keys = set(parsed.get("suggested_patch", {}).keys())
    known_fields = {
        "loan_id", "borrower_id", "loan_type", "origination_date", "maturity_date",
        "original_principal", "current_balance", "interest_rate", "term_months",
        "borrower_state", "loan_purpose", "credit_grade", "employment_length",
        "income_band", "payment_status", "days_past_due", "servicer_name",
        "last_payment_date", "last_updated_at", "document_status", "source_system",
    }
    unknown_fields = patch_keys - known_fields
    if unknown_fields:
        guardrail_checks.append(f"⚠ Patch contains unknown fields: {unknown_fields}")
    else:
        guardrail_checks.append("✓ No hallucinated fields in patch")

    overall = "PASS" if (json_valid and has_explanation and has_patch and not unknown_fields) else "WARN"
    guardrail_checks.append(f"Guardrail Result: {overall}")

    agentic_trace.append({
        "step": "GUARDRAIL_EXECUTION",
        "label": "Guardrail Validation",
        "content": "\n".join(guardrail_checks),
        "status": overall,
    })

    return AISuggestion(
        exception_id=exception_data.get("id", 0),
        loan_id=exception_data.get("loan_id", ""),
        suggested_patch=parsed.get("suggested_patch", {}),
        explanation=parsed.get("explanation", "Unable to generate explanation"),
        confidence=float(parsed.get("confidence", 0.5)),
        severity_assessment=parsed.get("severity_assessment", "MEDIUM"),
        model_name=model_name,
        prompt_used=prompt,
        generated_at=datetime.now(timezone.utc),
        agentic_trace=agentic_trace,
    )


async def suggest_rule(pattern: dict) -> dict:
    """
    Call LLM to synthesize a new validation rule from a recurring pattern.
    Used by the self-healing pipeline.
    """
    prompt = _build_suggest_rule_prompt(pattern)
    model_name = "mock-fallback"

    try:
        if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here":
            result = await _call_gemini(prompt)
            response_text = result["text"]
            model_name = result["model"]
        elif settings.ANTHROPIC_API_KEY and settings.ANTHROPIC_API_KEY != "your_anthropic_api_key_here":
            result = await _call_anthropic(prompt)
            response_text = result["text"]
            model_name = result["model"]
        else:
            response_text = json.dumps(_mock_rule_response(pattern))
            model_name = "mock-fallback"
    except Exception:
        response_text = json.dumps(_mock_rule_response(pattern))
        model_name = "mock-fallback"

    try:
        parsed = json.loads(response_text)
    except json.JSONDecodeError:
        parsed = _mock_rule_response(pattern)

    parsed["model_name"] = model_name
    parsed["prompt_used"] = prompt
    parsed["generated_at"] = datetime.now(timezone.utc).isoformat()
    parsed["source_pattern"] = pattern

    return parsed


# ── LLM API Callers ──────────────────────────────────────────

async def _call_gemini(prompt: str) -> dict:
    """Call Google Gemini API."""
    from google import genai

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
    )
    return {
        "text": response.text,
        "model": "gemini-2.0-flash",
    }


async def _call_anthropic(prompt: str) -> dict:
    """Call Anthropic Claude API."""
    import anthropic

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return {
        "text": message.content[0].text,
        "model": "claude-sonnet-4-20250514",
    }


# ── Mock fallbacks ───────────────────────────────────────────

def _mock_response(exception_data: dict, loan_state: dict) -> dict:
    """Generate a realistic mock AI response when no API keys are configured."""
    field = exception_data.get("field_name", "unknown")
    actual = exception_data.get("actual_value", "")
    expected = exception_data.get("expected_value", "")
    rule = exception_data.get("rule_id", "")

    # Generate contextual mock suggestions
    patch = {}
    explanation = f"The field '{field}' has value '{actual}' which violates rule '{rule}'."

    if "NEGATIVE" in rule:
        patch = {field: abs(float(actual)) if actual else 0}
        explanation = f"The {field} value '{actual}' is negative. This is likely a data entry error. The absolute value should be used."
    elif "MISSING" in rule:
        patch = {field: f"UNKNOWN_{field.upper()}"}
        explanation = f"The {field} is missing. A placeholder has been suggested pending manual verification."
    elif "DATE" in rule:
        patch = {field: "2024-01-01"}
        explanation = f"The date value '{actual}' could not be parsed. Please verify the correct date format."
    elif "MATURITY" in rule:
        patch = {"maturity_date": "2030-01-01"}
        explanation = f"Maturity date ({actual}) is before or equal to origination date. This likely indicates a data entry error."
    elif "STATUS" in rule:
        patch = {field: "CURRENT"}
        explanation = f"Payment status '{actual}' is not recognized. Most similar valid status: 'CURRENT'."
    elif "STALE" in rule:
        patch = {"last_updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d")}
        explanation = f"Record was last updated on {actual}, which exceeds the 180-day staleness threshold."
    elif "DUPLICATE" in rule:
        explanation = f"Loan {exception_data.get('loan_id')} appears to have been imported multiple times. Review for deduplication."
    else:
        patch = {field: expected if expected else actual}
        explanation = f"Field '{field}' value '{actual}' does not meet the expected criteria: '{expected}'."

    return {
        "explanation": explanation,
        "suggested_patch": patch,
        "confidence": 0.75,
        "severity_assessment": exception_data.get("severity", "MEDIUM"),
    }


def _mock_rule_response(pattern: dict) -> dict:
    """Generate a mock rule synthesis response."""
    field = pattern.get("field_name", "unknown")
    transformations = pattern.get("transformations", {})

    return {
        "rule_name": f"auto_fix_{field}_mapping",
        "field_name": field,
        "condition_json": None,
        "transformation_json": {"map": transformations} if transformations else None,
        "error_message": f"Auto-detected pattern: {field} value should be transformed based on {len(transformations)} observed corrections",
        "severity": "MEDIUM",
    }
