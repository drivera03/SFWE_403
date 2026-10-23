from pydantic import BaseModel, field_validator

VALID_ROLES = {
    "lab_manager",
    "specimen_collector",
    "technician",
    "lab_technician",
    "pathologist",
    "billing",
    "physician",
}


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    username: str | None = None
    email: str | None = None
    password: str
    role: Role

    @field_validator("password")
    @classmethod
    def password_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        # bcrypt only uses the first 72 bytes; reject rather than silently truncate.
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 bytes.")
        return v

class LockedUserResponse(BaseModel):
    id: int
    email: str
    role: str
    locked_until: datetime

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Username cannot be empty")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not v or len(v) < 1:
            raise ValueError("Password cannot be empty")
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        cleaned = v.strip().lower().replace(" ", "_")
        if cleaned not in VALID_ROLES:
            raise ValueError(f"Invalid role '{v}'. Allowed roles are: {', '.join(sorted(VALID_ROLES))}")
        return cleaned


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    username: str | None = None
    email: str | None = None
    role: str
    is_locked: bool = False
    failed_attempts: int = 0

    class Config:
        from_attributes = True


class UnlockResponse(BaseModel):
    message: str
    user_id: int
    is_locked: bool
    failed_attempts: int


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
