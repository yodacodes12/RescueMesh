"""Wire format of an SOS message.

`SOSMessageIn` mirrors `SOSMessage` in mobile/src/mesh/core/types.ts. The same
JSON travels phone -> phone over the mesh and phone -> server over HTTP.
"""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models import (
    AckType, AssignmentStatus, DeliveryStatus, EmergencyType, IngestChannel, Priority,
    RelayTransport, RescueStatus,
)
from app.schemas.common import AwareDatetime, ORMModel

DEVICE_ID = Field(min_length=4, max_length=64, pattern=r"^[A-Za-z0-9_.:-]+$")


class RelayHopIn(BaseModel):
    device_id: str = DEVICE_ID
    device_name: str | None = Field(default=None, max_length=64)
    hop: int = Field(ge=0, le=64)
    transport: RelayTransport
    received_at: AwareDatetime


class SOSMessageIn(BaseModel):
    message_id: uuid.UUID
    sender_id: str = DEVICE_ID
    sender_name: str | None = Field(default=None, max_length=64)
    emergency_type: EmergencyType
    priority: Priority
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    location_accuracy_m: float | None = Field(default=None, ge=0, le=100_000)
    description: str = Field(default="", max_length=1000)
    people_affected: int | None = Field(default=None, ge=1, le=100_000)
    created_at: AwareDatetime
    expiry_at: AwareDatetime
    hop_count: int = Field(default=0, ge=0)
    relay_history: list[RelayHopIn] = Field(default_factory=list, max_length=64)
    is_simulated: bool = False

    @field_validator("description")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @model_validator(mode="after")
    def _check(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be provided together")
        if self.expiry_at <= self.created_at:
            raise ValueError("expiry_at must be after created_at")
        return self


class SOSIngestResult(BaseModel):
    message_id: uuid.UUID
    result: str  # "created" | "duplicate" | "rejected"
    reason: str | None = None
    delivery_status: DeliveryStatus | None = None
    rescue_status: RescueStatus | None = None


class SyncRequest(BaseModel):
    """Batch upload from a gateway phone that collected messages over the mesh."""

    gateway_device_id: str = DEVICE_ID
    gateway_name: str | None = Field(default=None, max_length=64)
    is_simulated: bool = False
    messages: list[SOSMessageIn] = Field(max_length=500)


class SyncResponse(BaseModel):
    results: list[SOSIngestResult]
    created: int
    duplicates: int
    rejected: int
    server_time: datetime


class StatusQuery(BaseModel):
    message_ids: list[uuid.UUID] = Field(max_length=500)


class MessageStatus(BaseModel):
    """Public status record. Deliberately contains NO location or description,
    because it is served without authentication to any phone on the mesh."""

    message_id: uuid.UUID
    delivery_status: DeliveryStatus
    rescue_status: RescueStatus
    priority: Priority
    updated_at: datetime


class StatusQueryResponse(BaseModel):
    statuses: list[MessageStatus]
    unknown: list[uuid.UUID]
    server_time: datetime


class RescueStatusUpdate(BaseModel):
    rescue_status: RescueStatus
    note: str | None = Field(default=None, max_length=500)


class PriorityUpdate(BaseModel):
    priority: Priority
    note: str | None = Field(default=None, max_length=500)


class AcknowledgeIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class RelayHopOut(ORMModel):
    hop_index: int
    device_id: str
    device_name: str | None
    transport: RelayTransport
    received_at: datetime


class StatusEventOut(ORMModel):
    id: int
    event: str
    from_value: str | None
    to_value: str | None
    note: str | None
    actor_username: str | None = None
    created_at: datetime


class AckOut(ORMModel):
    id: int
    ack_type: AckType
    note: str | None
    acknowledged_by_username: str | None = None
    created_at: datetime


class AssignmentBrief(ORMModel):
    id: int
    volunteer_id: int
    volunteer_name: str
    status: AssignmentStatus
    notes: str | None
    created_at: datetime
    updated_at: datetime


class SOSOut(ORMModel):
    message_id: uuid.UUID
    sender_id: str
    sender_name: str | None
    emergency_type: EmergencyType
    priority: Priority
    original_priority: Priority
    latitude: float | None
    longitude: float | None
    location_accuracy_m: float | None
    description: str
    people_affected: int | None
    created_at: datetime
    expiry_at: datetime
    received_at: datetime
    updated_at: datetime
    hop_count: int
    received_via: IngestChannel
    gateway_id: str | None
    is_simulated: bool
    duplicate_receipts: int
    delivery_status: DeliveryStatus
    rescue_status: RescueStatus
    active_assignment: AssignmentBrief | None
    priority_score: float


class SOSDetail(SOSOut):
    relay_history: list[RelayHopOut]
    status_events: list[StatusEventOut]
    acknowledgements: list[AckOut]
    assignments: list[AssignmentBrief]
