import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status
from app.schemas.auth import LoginRequest, TokenResponse
from app.security import verify_password, create_access_token, password_hash, DUMMY_HASH

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/auth", tags=["auth"])

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

# TEMPORARY: replace with a real DB lookup once the User model exists
_FAKE_USERS = {
    "tech@example.com": {
        "id": 1,
        "role": "technician",
        "password_hash": password_hash.hash("changeme123"),
        "failed_login_attempts": 0,
        "locked_until": None,  # new
    },
    "mason@example.com": {
        "id": 2,
        "role": "manager",
        "password_hash": password_hash.hash("password456"),
        "failed_login_attempts": 0,
        "locked_until": None,  # new
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

def lock_account(user: dict) -> None:
    user["locked_until"] = now_utc() + timedelta(minutes=LOCKOUT_MINUTES)

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
                lock_account(user)
                logger.warning("Account locked user_id=%s until %s", user["id"], user["locked_until"])
                raise locked_error(user)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    reset_failed_logins(user)
    return TokenResponse(access_token=create_access_token(str(user["id"]), user["role"]))