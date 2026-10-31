from pydantic import BaseModel, ConfigDict, Field, field_validator

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
    role: str = "technician"

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


class SignupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    password: str = Field(min_length=8)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        cleaned = value.strip().lower()
        local, separator, domain = cleaned.partition("@")
        if (
            not separator or not local or "." not in domain
            or domain.startswith(".") or domain.endswith(".") or "@" in domain
            or any(c.isspace() for c in cleaned)
        ):
            raise ValueError("Enter a valid email address")
        return cleaned

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 bytes")
        return value


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
