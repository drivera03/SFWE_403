from fastapi import APIRouter, HTTPException, status
from app.schemas.auth import LoginRequest, TokenResponse
from app.security import verify_password, create_access_token, password_hash, DUMMY_HASH
import logging

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/auth", tags=["auth"])

# TEMPORARY: replace with a real DB lookup once the User model exists
_FAKE_USERS = {
    "tech@example.com": {
        "id": 1,
        "role": "technician",
        "password_hash": password_hash.hash("changeme123"),
        "failed_login_attempts": 0,   # new
    },
}

def record_failed_login(user: dict) -> int:
    user["failed_login_attempts"] += 1
    return user["failed_login_attempts"]

def reset_failed_logins(user: dict) -> None:
    user["failed_login_attempts"] = 0

@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    user = get_user_by_email(body.email)
    ok = verify_password(body.password, user["password_hash"] if user else DUMMY_HASH)
    if not user or not ok:
        if user:
            count = record_failed_login(user)
            logger.warning("Failed login for user_id=%s (attempts=%s)", user["id"], count)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    reset_failed_logins(user)
    return TokenResponse(access_token=create_access_token(str(user["id"]), user["role"]))


def get_user_by_email(email: str):
    return _FAKE_USERS.get(email)

@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    user = get_user_by_email(body.email)
    # Always verify, even for unknown users, so timing doesn't leak which emails exist
    ok = verify_password(body.password, user["password_hash"] if user else DUMMY_HASH)
    if not user or not ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    return TokenResponse(access_token=create_access_token(str(user["id"]), user["role"]))