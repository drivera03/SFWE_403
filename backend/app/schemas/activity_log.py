from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator


class ActivityLogResponse(BaseModel):
    id: int
    user_id: int | None = None
    username: str | None = None
    email: str | None = None
    action: str
    resource_type: str | None = None
    resource_id: str | None = None
    details: Any = None
    timestamp: datetime

    @field_validator("timestamp")
    @classmethod
    def assume_utc(cls, value: datetime) -> datetime:
        # Timestamps are stored in UTC, but some databases (SQLite) return them without a
        # timezone. Mark them as UTC so clients don't misread them as local time.
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class ActivityLogUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str | None = None
    email: str | None = None
    role: str
