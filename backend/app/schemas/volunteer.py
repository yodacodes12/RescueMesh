from datetime import datetime

from pydantic import BaseModel, Field

from app.models import AssignmentStatus, VolunteerStatus
from app.schemas.common import ORMModel


class VolunteerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    phone: str | None = Field(default=None, max_length=32)
    team_name: str | None = Field(default=None, max_length=128)
    skills: str | None = Field(default=None, max_length=256)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class VolunteerUpdate(BaseModel):
    status: VolunteerStatus


class VolunteerOut(ORMModel):
    id: int
    name: str
    phone: str | None
    team_name: str | None
    skills: str | None
    status: VolunteerStatus
    latitude: float | None
    longitude: float | None
    is_demo: bool
    active_assignments: int = 0


class AssignmentCreate(BaseModel):
    message_id: str
    volunteer_id: int
    notes: str | None = Field(default=None, max_length=500)


class AssignmentUpdate(BaseModel):
    status: AssignmentStatus
    notes: str | None = Field(default=None, max_length=500)


class AssignmentOut(ORMModel):
    id: int
    message_id: str
    volunteer_id: int
    volunteer_name: str
    status: AssignmentStatus
    notes: str | None
    assigned_by: str | None
    created_at: datetime
    updated_at: datetime
