"""
Mock JWT authentication and role-based access control.
Provides:
  - create_access_token / decode_access_token
  - get_current_user  (FastAPI dependency)
  - require_role      (FastAPI dependency factory)
"""

from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db

settings = get_settings()
_bearer = HTTPBearer(auto_error=False)


# ── Roles ─────────────────────────────────────────────────────
class UserRole(str, Enum):
    ADMIN = "ADMIN"
    DATA_OPERATOR = "DATA_OPERATOR"
    REVIEWER = "REVIEWER"
    DATA_CONSUMER = "DATA_CONSUMER"


# ── Token helpers ─────────────────────────────────────────────
def create_access_token(
    user_id: int,
    username: str,
    role: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.JWT_EXPIRATION_MINUTES)
    )
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


# ── FastAPI Dependencies ──────────────────────────────────────
async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
):
    """
    Extracts and validates the JWT from the Authorization header.
    Returns a dict with user info for downstream handlers.
    Raises 401 if no token is provided or if the token is invalid.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    return {
        "user_id": int(payload["sub"]),
        "username": payload["username"],
        "role": UserRole(payload["role"]),
    }


def require_role(*allowed_roles: UserRole):
    """
    Dependency factory that restricts access to specific roles.

    Usage:
        @router.get("/admin", dependencies=[Depends(require_role(UserRole.REVIEWER))])
    """

    async def _check(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role {current_user['role']} not authorized. "
                f"Required: {[r.value for r in allowed_roles]}",
            )
        return current_user

    return _check
