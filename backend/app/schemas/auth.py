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
    username: str
    password: str
    role: str
    email: str | None = None

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
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