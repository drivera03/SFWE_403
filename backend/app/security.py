import os
from typing import Any
import jwt
from datetime import datetime, timedelta, timezone
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()  # argon2
DUMMY_HASH = password_hash.hash("not-a-real-password")

SECRET_KEY = os.environ["SECRET_KEY"]  # fail loudly if it's missing
if not SECRET_KEY.strip():
    raise ValueError("SECRET_KEY must not be empty")
ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = int(os.getenv(
    "ACCESS_TOKEN_EXPIRE_MINUTES", os.getenv("ACCESS_TOKEN_MINUTES", "30")
))
if ACCESS_TOKEN_MINUTES <= 0:
    raise ValueError("Access token lifetime must be positive")

def verify_password(plain: str, hashed: str) -> bool:
    return password_hash.verify(plain, hashed)

def create_access_token(
    sub: str, role: str, expires_delta: timedelta | None = None
) -> str:
    """Create a signed token with a UTC expiration and optional custom lifetime."""
    if not isinstance(sub, str) or not sub.strip():
        raise ValueError("sub must be a non-empty string")
    if not isinstance(role, str) or not role.strip():
        raise ValueError("role must be a non-empty string")
    lifetime = (timedelta(minutes=ACCESS_TOKEN_MINUTES)
                if expires_delta is None else expires_delta)
    if lifetime < timedelta(seconds=1):
        raise ValueError("Token lifetime must be at least one second")
    exp = datetime.now(timezone.utc) + lifetime
    return jwt.encode({"sub": sub, "role": role, "exp": exp}, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Verify signature, expiration, and required access-token claims.

    Raises jwt.ExpiredSignatureError for expired tokens and jwt.InvalidTokenError
    (or a subclass) for malformed tokens or invalid claims. No unverified claims
    are returned. Expiration is enforced without clock-skew leeway.
    """
    payload = jwt.decode(
        token, SECRET_KEY, algorithms=[ALGORITHM],
        options={"require": ["sub", "role", "exp"]},
    )
    for claim in ("sub", "role"):
        if not isinstance(payload[claim], str) or not payload[claim].strip():
            raise jwt.InvalidTokenError(f"{claim} must be a non-empty string")
    if type(payload["exp"]) is not int:
        raise jwt.InvalidTokenError("exp must be an integer NumericDate")
    return payload
