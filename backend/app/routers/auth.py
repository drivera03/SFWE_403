import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas.auth import LoginRequest, TokenResponse, RegisterRequest, UserResponse
from app.security import verify_password, create_access_token, password_hash, DUMMY_HASH
from app.notifications import emit_lockout_notification
from app.dependencies import get_current_user
from app.models.user import User

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/auth", tags=["auth"])

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

# TEMPORARY: replace with a real DB lookup once the User model exists
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
    return _FAKE_USERS.get(email.lower())

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
    # Without this reset, the first failure after a lock expires would
    # push the count past the max and re-lock the account immediately.
    if user["locked_until"] is not None and user["locked_until"] <= now_utc():
        reset_failed_logins(user)

def locked_error(user: dict) -> HTTPException:
    retry_after = max(1, int((user["locked_until"] - now_utc()).total_seconds()))
    return HTTPException(
        status.HTTP_423_LOCKED,
        "Account temporarily locked. Try again later.",
        headers={"Retry-After": str(retry_after)},
    )

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest):
    email = body.email.strip().lower()
    if email in _FAKE_USERS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An account with this email already exists.")

    new_id = len(_FAKE_USERS) + 1
    _FAKE_USERS[email] = {
        "id": new_id,
        "email": email,
        "role": body.role,
        "password_hash": password_hash.hash(body.password),
        "failed_login_attempts": 0,
        "locked_until": None,
    }
    logger.info("Registered new user email=%s id=%s role=%s", email, new_id, body.role)
    return UserResponse(id=new_id, email=email, role=body.role)

@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    user = get_user_by_email(body.email)

    if user:
        clear_expired_lock(user)
        if is_locked(user):
            # Checked BEFORE the password, so a correct password can't bypass the lock,
            # and attempts during a lock don't extend it.
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

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Return the profile of the currently authenticated user."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
    }