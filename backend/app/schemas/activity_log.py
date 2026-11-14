from datetime import datetime
from typing import Any

from pydantic import BaseModel


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
