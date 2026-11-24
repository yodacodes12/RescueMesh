from datetime import datetime, timezone

from pydantic import AfterValidator, BaseModel, ConfigDict
from typing import Annotated


def _require_tz(v: datetime) -> datetime:
    """Reject naive timestamps: phones in a disaster zone may have any locale."""
    if v.tzinfo is None:
        raise ValueError("timestamp must include a timezone offset (ISO-8601, e.g. 2026-01-01T10:00:00Z)")
    return v.astimezone(timezone.utc)


AwareDatetime = Annotated[datetime, AfterValidator(_require_tz)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)
