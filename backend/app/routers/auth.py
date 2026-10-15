import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, RegisterRequest, UserResponse, UnlockResponse
from app.security import verify_password, create_access_token, password_hash, DUMMY_HASH
from app.notifications import emit_lockout_notification
from app.activity_logger import log_activity

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/auth", tags=["auth"])

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

# Maintained for backwards compatibility with tests
_FAKE_USERS = {
    "tech@example.com": {
        "id": 1,
        "email": "tech@example.com",
        "role": "technician",
        "password_hash": password_hash.hash("changeme123"),
        "failed_login_attempts": 0,
        "locked_until": None,
    },
    "mason@example.com": {
        "id": 2,
        "email": "mason@example.com",
        "role": "manager",
        "password_hash": password_hash.hash("password456"),
        "failed_login_attempts": 0,
        "locked_until": None,
    }
}


def get_user_by_email(email: str):
    return _FAKE_USERS.get(email)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def record_failed_login(user: dict) -> int:
    user["failed_login_attempts"] += 1
    return user["failed_login_attempts"]


def reset_failed_logins(user: dict) -> None:
    user["failed_login_attempts"] = 0
    user["locked_until"] = None


def lock_account(user: dict, email: str | None = None) -> None:
    user["locked_until"] = now_utc() + timedelta(minutes=LOCKOUT_MINUTES)
    user_id = user.get("id")
    user_email = email or user.get("email", "unknown")
    emit_lockout_notification(user_id=user_id, email=user_email, locked_until=user["locked_until"])


def is_locked(user: dict) -> bool:
    return user["locked_until"] is not None and user["locked_until"] > now_utc()


def clear_expired_lock(user: dict) -> None:
    if user["locked_until"] is not None and user["locked_until"] <= now_utc():
        reset_failed_logins(user)


def locked_error(user: dict) -> HTTPException:
    retry_after = max(1, int((user["locked_until"] - now_utc()).total_seconds()))
    return HTTPException(
        status.HTTP_423_LOCKED,
        "Account temporarily locked. Try again later.",
        headers={"Retry-After": str(retry_after)},
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    user = get_user_by_email(body.email)

    if user:
        clear_expired_lock(user)
        if is_locked(user):
            logger.warning("Login blocked, account locked user_id=%s", user["id"])
            raise locked_error(user)

    ok = verify_password(body.password, user["password_hash"] if user else DUMMY_HASH)
    if not user or not ok:
        if user:
            count = record_failed_login(user)
            logger.warning("Failed login for user_id=%s (attempts=%s)", user["id"], count)
            if count >= MAX_FAILED_ATTEMPTS:
                lock_account(user, email=body.email)
                logger.warning("Account locked user_id=%s until %s", user["id"], user["locked_until"])
                raise locked_error(user)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    reset_failed_logins(user)
    return TokenResponse(access_token=create_access_token(str(user["id"]), user["role"]))


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterRequest,
    current_user: User = Depends(require_role("lab_manager")),
    db: Session = Depends(get_db),
):
    """Create a new user account with a username, initial password, and role.

    Restricted to lab_manager only.
    Password is saved hashed with bcrypt and never logged or returned.
    """
    # Check for duplicate username
    existing_user = db.query(User).filter(
        or_(User.username == body.username, User.email == body.username)
    ).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )

    if body.email:
        existing_email = db.query(User).filter(User.email == body.email).first()
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already exists",
            )

    # Hash password with bcrypt before storage
    pw_hash = password_hash.hash(body.password)

    new_user = User(
        username=body.username,
        email=body.email or (body.username if "@" in body.username else f"{body.username}@clms.local"),
        password_hash=pw_hash,
        role=body.role,
        is_locked=False,
        failed_attempts=0,
        failed_login_attempts=0,
        locked_until=None,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Keep _FAKE_USERS in sync for lookup
    _FAKE_USERS[new_user.email] = {
        "id": new_user.id,
        "email": new_user.email,
        "role": new_user.role,
        "password_hash": new_user.password_hash,
        "failed_login_attempts": 0,
        "locked_until": None,
    }

    # Record event in activity log
    log_activity(
        db=db,
        action="user_registered",
        user_id=current_user.id,
        resource_type="user",
        resource_id=str(new_user.id),
        details={"username": new_user.username, "email": new_user.email, "role": new_user.role},
    )

    return new_user


@router.post("/unlock/{user_id}", response_model=UnlockResponse)
def unlock_user(
    user_id: int,
    current_user: User = Depends(require_role("lab_manager")),
    db: Session = Depends(get_db),
):
    """Unlock a locked account and reset failed attempts to 0.

    Restricted to lab_manager only.
    """
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )

    target_user.is_locked = False
    target_user.failed_attempts = 0
    target_user.failed_login_attempts = 0
    target_user.locked_until = None
    db.commit()
    db.refresh(target_user)

    # If present in _FAKE_USERS, reset there too
    for fake in _FAKE_USERS.values():
        if fake.get("id") == user_id:
            fake["failed_login_attempts"] = 0
            fake["locked_until"] = None

    # Record unlock event in activity log
    log_activity(
        db=db,
        action="user_unlocked",
        user_id=current_user.id,
        resource_type="user",
        resource_id=str(target_user.id),
        details={"unlocked_user_id": target_user.id, "username": target_user.username or target_user.email},
    )

    return UnlockResponse(
        message="User account unlocked successfully",
        user_id=target_user.id,
        is_locked=False,
        failed_attempts=0,
    )


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Return the profile of the currently authenticated user."""
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role,
        "is_locked": current_user.is_locked,
        "failed_attempts": current_user.failed_attempts,
    }