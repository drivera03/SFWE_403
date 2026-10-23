import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.auth import LoginRequest, TokenResponse, RegisterRequest, UserResponse, ChangePasswordRequest, LockedUserResponse
from app.security import verify_password, create_access_token, password_hash, DUMMY_HASH
from app.notifications import emit_lockout_notification
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    TokenResponse,
    RegisterRequest,
    UserResponse,
    UnlockResponse,
    ChangePasswordRequest,
)
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
    },
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime | None) -> datetime | None:
    # SQLite returns naive datetimes even for timezone-aware columns; treat them as UTC.
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def get_user_by_email(db: Session, email: str) -> User | None:
    cleaned = email.strip().lower()
    return db.query(User).filter(
        or_(User.email == cleaned, User.username == email.strip())
    ).first()


def record_failed_login(db: Session, user: User) -> int:
    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    user.failed_attempts = user.failed_login_attempts
    db.commit()
    return user.failed_login_attempts


def reset_failed_logins(db: Session, user: User) -> None:
    user.failed_login_attempts = 0
    user.failed_attempts = 0
    user.locked_until = None
    db.commit()


def lock_account(db: Session, user: User, email: str | None = None) -> None:
    locked_until = now_utc() + timedelta(minutes=LOCKOUT_MINUTES)
    user.locked_until = locked_until
    user.is_locked = True
    db.commit()
    emit_lockout_notification(user_id=user.id, email=email or user.email, locked_until=locked_until)


def is_locked(user: User) -> bool:
    if user.is_locked and user.locked_until is None:
        return True
    locked_until = as_utc(user.locked_until)
    return locked_until is not None and locked_until > now_utc()


def clear_expired_lock(db: Session, user: User) -> None:
    locked_until = as_utc(user.locked_until)
    if locked_until is not None and locked_until <= now_utc():
        user.is_locked = False
        reset_failed_logins(db, user)


def locked_error(user: User) -> HTTPException:
    locked_until = as_utc(user.locked_until)
    if locked_until:
        retry_after = max(1, int((locked_until - now_utc()).total_seconds()))
    else:
        retry_after = LOCKOUT_MINUTES * 60
    return HTTPException(
        status.HTTP_423_LOCKED,
        "Account temporarily locked. Try again later.",
        headers={"Retry-After": str(retry_after)},
    )

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterRequest,
    db: Session = Depends(get_db),
    manager: User = Depends(require_role("lab_manager")),
):
    """Create a user account. Lab managers only."""
    email = body.email.strip().lower()
    if get_user_by_email(db, email):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An account with this email already exists.")

    user = User(
        email=email,
        role=body.role,
        password_hash=password_hash.hash(body.password),
        failed_login_attempts=0,
        locked_until=None,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Two simultaneous registrations for the same email: the unique index catches the loser.
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An account with this email already exists.")
    db.refresh(user)

    # Never log the password or its hash.
    logger.info("User registered id=%s role=%s created_by=%s", user.id, user.role, manager.id)
    return UserResponse(id=user.id, email=user.email, role=user.role)

@router.get("/locked-users", response_model=list[LockedUserResponse])
def list_locked_users(
    db: Session = Depends(get_db),
    manager: User = Depends(require_role("lab_manager")),
):
    """List accounts that are currently locked. Lab managers only."""
    candidates = db.query(User).filter(User.locked_until.is_not(None)).order_by(User.email).all()
    return [
        LockedUserResponse(id=u.id, email=u.email, role=u.role, locked_until=as_utc(u.locked_until))
        for u in candidates
        if is_locked(u)
    ]

@router.post("/unlock/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def unlock_account(
    user_id: int,
    db: Session = Depends(get_db),
    manager: User = Depends(require_role("lab_manager")),
):
    """Unlock an account and reset its failed-login counter. Lab managers only."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    was_locked = is_locked(user)
    previous_attempts = user.failed_login_attempts
    reset_failed_logins(db, user)  # clears failed_login_attempts and locked_until, then commits

    logger.info(
        "Account unlocked user_id=%s by=%s was_locked=%s previous_failed_attempts=%s",
        user.id, manager.id, was_locked, previous_attempts,
    )

@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = get_user_by_email(db, body.email)

    if user:
        clear_expired_lock(db, user)
        if is_locked(user):
            logger.warning("Login blocked, account locked user_id=%s", user.id)
            raise locked_error(user)

    ok = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if not user or not ok:
        if user:
            count = record_failed_login(db, user)
            logger.warning("Failed login for user_id=%s (attempts=%s)", user.id, count)
            if count >= MAX_FAILED_ATTEMPTS:
                lock_account(db, user, email=body.email)
                logger.warning("Account locked user_id=%s until %s", user.id, user.locked_until)
                raise locked_error(user)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    reset_failed_logins(db, user)
    return TokenResponse(access_token=create_access_token(str(user.id), user.role))


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
    username = body.username or (body.email.split("@")[0] if body.email else None)
    email = body.email or (f"{username}@clms.local" if username else None)

    if not username and not email:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Username or email is required")

    # Check for duplicate username
    if username:
        existing_user = db.query(User).filter(
            or_(User.username == username, User.email == username)
        ).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already exists",
            )

    if email:
        existing_email = db.query(User).filter(
            or_(User.email == email.strip().lower(), User.username == email)
        ).first()
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already exists",
            )

    # Hash password with bcrypt before storage
    pw_hash = password_hash.hash(body.password)

    new_user = User(
        username=username,
        email=email.strip().lower() if email else None,
        password_hash=pw_hash,
        role=body.role,
        is_locked=False,
        failed_attempts=0,
        failed_login_attempts=0,
        locked_until=None,
    )
    db.add(new_user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Username or email already exists")
    db.refresh(new_user)

    # Keep _FAKE_USERS in sync for lookup if email is present
    if new_user.email:
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

    logger.info("Registered new user email=%s id=%s role=%s", new_user.email, new_user.id, new_user.role)
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


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the password of the currently authenticated user."""
    user = current_user

    clear_expired_lock(db, user)
    if is_locked(user):
        logger.warning("Password change blocked, account locked user_id=%s", user.id)
        raise locked_error(user)

    if not verify_password(body.current_password, user.password_hash):
        count = record_failed_login(db, user)
        logger.warning("Failed password change for user_id=%s (attempts=%s)", user.id, count)
        if count >= MAX_FAILED_ATTEMPTS:
            lock_account(db, user)
            logger.warning("Account locked user_id=%s until %s", user.id, user.locked_until)
            raise locked_error(user)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")

    if verify_password(body.new_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "New password must be different from the current password")

    user.password_hash = password_hash.hash(body.new_password)
    reset_failed_logins(db, user)
    logger.info("Password changed user_id=%s", user.id)
