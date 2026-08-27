"""
Authentication endpoints – mock JWT login with role selection.
"""

import hashlib

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import UserRole, create_access_token, get_current_user
from app.models.user import User

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str
    role: str


class UserResponse(BaseModel):
    user_id: int
    username: str
    email: str
    role: str


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    """
    Mock login – authenticates with SHA-256 hashed password.
    Default users: operator/operator123, reviewer/reviewer123, consumer/consumer123
    """
    user = db.query(User).filter(User.username == req.username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    hashed = hashlib.sha256(req.password.encode()).hexdigest()
    if user.hashed_password != hashed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    token = create_access_token(
        user_id=user.id,
        username=user.username,
        role=user.role,
    )

    return LoginResponse(
        access_token=token,
        user_id=user.id,
        username=user.username,
        role=user.role,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current authenticated user."""
    user = db.query(User).filter(User.id == current_user["user_id"]).first()
    if not user:
        return UserResponse(
            user_id=current_user["user_id"],
            username=current_user["username"],
            email="",
            role=current_user["role"],
        )
    return UserResponse(
        user_id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
    )


@router.get("/users", response_model=list[UserResponse])
async def list_users(db: Session = Depends(get_db)):
    """List all users (for role switching in dev mode)."""
    users = db.query(User).all()
    return [
        UserResponse(
            user_id=u.id,
            username=u.username,
            email=u.email,
            role=u.role,
        )
        for u in users
    ]
