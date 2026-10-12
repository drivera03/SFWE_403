from collections.abc import Iterable
from typing import Any
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.security import decode_access_token

http_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(http_bearer),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency to extract and verify the JWT from Authorization: Bearer <token>

    and return the matching user from the database.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if credentials.scheme.lower() != "bearer" or not credentials.credentials or not credentials.credentials.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials.strip()

    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user: User | None = None
    if isinstance(sub, int) or (isinstance(sub, str) and sub.isdigit()):
        user = db.query(User).filter(User.id == int(sub)).first()

    if not user and isinstance(sub, str):
        user = db.query(User).filter(User.email == sub).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def require_role(*roles: str | Iterable[str]):
    """Reusable role-gating dependency factory built on get_current_user().

    Endpoints declare which roles may access them, e.g.:
        Depends(require_role("lab_manager"))
        Depends(require_role("lab_manager", "technician"))

    Raises HTTP 403 Forbidden if the authenticated user's role is not authorized.
    """
    allowed_roles: set[str] = set()
    for role in roles:
        if isinstance(role, str):
            allowed_roles.add(role)
        elif hasattr(role, "__iter__"):
            allowed_roles.update(str(r) for r in role)
        else:
            allowed_roles.add(str(role))

    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        user_role = getattr(current_user, "role", None) or ""
        normalized_allowed = {r.lower() for r in allowed_roles}

        if user_role not in allowed_roles and user_role.lower() not in normalized_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted",
            )
        return current_user

    return role_checker
