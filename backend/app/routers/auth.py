import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.auth import LoginRequest, TokenResponse, RegisterRequest, UserResponse, ChangePasswordRequest
from app.security import verify_password, create_access_token, password_hash, DUMMY_HASH
from app.notifications import emit_lockout_notification
from app.dependencies import get_current_user, require_role
from app.models.user import User

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/auth", tags=["auth"])

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email.strip().lower()).first()

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def as_utc(value: datetime | None) -> datetime | None:
    # SQLite returns naive datetimes even for timezone-aware columns; treat them as UTC.
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value

def record_failed_login(db: Session, user: User) -> int:
    user.failed_login_attempts += 1
    db.commit()
    return user.failed_login_attempts

def reset_failed_logins(db: Session, user: User) -> None:
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()

def lock_account(db: Session, user: User, email: str | None = None) -> None:
    locked_until = now_utc() + timedelta(minutes=LOCKOUT_MINUTES)
    user.locked_until = locked_until
    db.commit()
    emit_lockout_notification(user_id=user.id, email=email or user.email, locked_until=locked_until)

def is_locked(user: User) -> bool:
    locked_until = as_utc(user.locked_until)
    return locked_until is not None and locked_until > now_utc()

def clear_expired_lock(db: Session, user: User) -> None:
    # Without this reset, the first failure after a lock expires would
    # push the count past the max and re-lock the account immediately.
    locked_until = as_utc(user.locked_until)
    if locked_until is not None and locked_until <= now_utc():
        reset_failed_logins(db, user)

def locked_error(user: User) -> HTTPException:
    retry_after = max(1, int((as_utc(user.locked_until) - now_utc()).total_seconds()))
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
            # Checked BEFORE the password, so a correct password can't bypass the lock,
            # and attempts during a lock don't extend it.
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

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Return the profile of the currently authenticated user."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
    }

@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the password of the currently authenticated user."""
    # get_db is cached per request, so current_user belongs to this same session.
    user = current_user

    clear_expired_lock(db, user)
    if is_locked(user):
        # Same rule as login: checked before the password so a lock can't be bypassed.
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
    reset_failed_logins(db, user)  # also commits the new hash
    logger.info("Password changed user_id=%s", user.id)