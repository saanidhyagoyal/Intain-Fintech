"""
Application configuration via Pydantic BaseSettings.
Reads environment variables from the project-root .env file.
"""

from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings

# .env lives at the project root (two levels up from this file)
_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    """Central configuration object – all values can be overridden via env vars."""

    # ── Database ──────────────────────────────────────────────
    DATABASE_URL: str = "sqlite:///./loan_copilot.db"

    # ── AI API Keys ───────────────────────────────────────────
    GEMINI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    # ── Security ──────────────────────────────────────────────
    SECRET_KEY: str = "dev_secret_key_12345"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 480  # 8 hours

    # ── App ───────────────────────────────────────────────────
    APP_NAME: str = "Loan Data Verification Copilot"
    DEBUG: bool = True
    RESET_DB_ON_STARTUP: bool = False  # Set True to wipe DB on every restart

    model_config = {
        "env_file": str(_ENV_PATH),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    """Cached singleton so the .env file is only read once."""
    return Settings()
