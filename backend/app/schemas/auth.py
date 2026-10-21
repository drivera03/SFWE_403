from typing import Literal

from pydantic import BaseModel, field_validator

# Keep in sync with ROLES in frontend/src/pages/Signup.jsx
Role = Literal[
    "lab_manager",
    "specimen_collector",
    "lab_technician",
    "pathologist",
    "billing",
    "physician",
]

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    email: str
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

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserResponse(BaseModel):
    id: int
    email: str
    role: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str