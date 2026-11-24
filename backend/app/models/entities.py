"""ORM entities.

Duplicate protection: `sos_requests.message_id` is UNIQUE. The mobile app
generates the UUID once at creation time, so the same SOS arriving through
three different gateways can only ever produce one emergency record.
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Enum, Float, ForeignKey, Index, Integer, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import (
    AckType, AssignmentStatus, DeliveryStatus, EmergencyType, IngestChannel, Priority,
    RelayTransport, RescueStatus, UserRole, VolunteerStatus,
)


def _enum(e):
    # Stored as VARCHAR + CHECK constraint: easier to evolve than native PG enums.
    return Enum(e, native_enum=False, length=32, validate_strings=True)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(128))
    hashed_password: Mapped[str] = mapped_column(String(128))
    role: Mapped[UserRole] = mapped_column(_enum(UserRole), default=UserRole.COORDINATOR)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Device(TimestampMixin, Base):
    """A phone running RescueMesh. Registered implicitly the first time it is seen."""

    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str | None] = mapped_column(String(64))
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SOSRequest(TimestampMixin, Base):
    __tablename__ = "sos_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, index=True)
    sender_device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    sender_name: Mapped[str | None] = mapped_column(String(64))
    emergency_type: Mapped[EmergencyType] = mapped_column(_enum(EmergencyType))
    priority: Mapped[Priority] = mapped_column(_enum(Priority), index=True)
    original_priority: Mapped[Priority] = mapped_column(_enum(Priority))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    location_accuracy_m: Mapped[float | None] = mapped_column(Float)
    description: Mapped[str] = mapped_column(Text, default="")
    people_affected: Mapped[int | None] = mapped_column(Integer)
    device_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expiry_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    hop_count: Mapped[int] = mapped_column(Integer, default=0)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    received_via: Mapped[IngestChannel] = mapped_column(_enum(IngestChannel))
    gateway_device_id: Mapped[int | None] = mapped_column(ForeignKey("devices.id"))
    duplicate_receipts: Mapped[int] = mapped_column(Integer, default=0)

    delivery_status: Mapped[DeliveryStatus] = mapped_column(
        _enum(DeliveryStatus), default=DeliveryStatus.SERVER_RECEIVED
    )
    rescue_status: Mapped[RescueStatus] = mapped_column(
        _enum(RescueStatus), default=RescueStatus.RECEIVED, index=True
    )

    sender_device: Mapped[Device] = relationship(foreign_keys=[sender_device_id])
    gateway_device: Mapped[Device | None] = relationship(foreign_keys=[gateway_device_id])
    relay_history: Mapped[list["MessageRelayHistory"]] = relationship(
        back_populates="sos", cascade="all, delete-orphan", order_by="MessageRelayHistory.hop_index"
    )
    status_events: Mapped[list["SOSStatusEvent"]] = relationship(
        back_populates="sos", cascade="all, delete-orphan", order_by="SOSStatusEvent.created_at"
    )
    assignments: Mapped[list["RescueAssignment"]] = relationship(
        back_populates="sos", cascade="all, delete-orphan", order_by="RescueAssignment.created_at"
    )
    acknowledgements: Mapped[list["DeliveryAcknowledgement"]] = relationship(
        back_populates="sos", cascade="all, delete-orphan", order_by="DeliveryAcknowledgement.created_at"
    )

    __table_args__ = (Index("ix_sos_status_priority", "rescue_status", "priority"),)


class MessageRelayHistory(Base):
    """One hop of the path an SOS took: origin phone -> relays -> gateway -> server."""

    __tablename__ = "message_relay_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    sos_id: Mapped[int] = mapped_column(ForeignKey("sos_requests.id", ondelete="CASCADE"), index=True)
    hop_index: Mapped[int] = mapped_column(Integer)
    device_id: Mapped[str] = mapped_column(String(64))
    device_name: Mapped[str | None] = mapped_column(String(64))
    transport: Mapped[RelayTransport] = mapped_column(_enum(RelayTransport))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    sos: Mapped[SOSRequest] = relationship(back_populates="relay_history")

    __table_args__ = (UniqueConstraint("sos_id", "hop_index", "device_id", name="uq_relay_hop"),)


class SOSStatusEvent(Base):
    """Audit trail of every status/priority change on an SOS ("message history")."""

    __tablename__ = "sos_status_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    sos_id: Mapped[int] = mapped_column(ForeignKey("sos_requests.id", ondelete="CASCADE"), index=True)
    event: Mapped[str] = mapped_column(String(48))
    from_value: Mapped[str | None] = mapped_column(String(48))
    to_value: Mapped[str | None] = mapped_column(String(48))
    note: Mapped[str | None] = mapped_column(Text)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sos: Mapped[SOSRequest] = relationship(back_populates="status_events")
    actor: Mapped[User | None] = relationship()


class Volunteer(TimestampMixin, Base):
    __tablename__ = "volunteers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    phone: Mapped[str | None] = mapped_column(String(32))
    team_name: Mapped[str | None] = mapped_column(String(128))
    skills: Mapped[str | None] = mapped_column(String(256))
    status: Mapped[VolunteerStatus] = mapped_column(_enum(VolunteerStatus), default=VolunteerStatus.AVAILABLE, index=True)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class RescueAssignment(TimestampMixin, Base):
    __tablename__ = "rescue_assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    sos_id: Mapped[int] = mapped_column(ForeignKey("sos_requests.id", ondelete="CASCADE"), index=True)
    volunteer_id: Mapped[int] = mapped_column(ForeignKey("volunteers.id"), index=True)
    assigned_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    status: Mapped[AssignmentStatus] = mapped_column(_enum(AssignmentStatus), default=AssignmentStatus.ASSIGNED)
    notes: Mapped[str | None] = mapped_column(Text)

    sos: Mapped[SOSRequest] = relationship(back_populates="assignments")
    volunteer: Mapped[Volunteer] = relationship()
    assigned_by: Mapped[User | None] = relationship()


class DeliveryAcknowledgement(Base):
    __tablename__ = "delivery_acknowledgements"

    id: Mapped[int] = mapped_column(primary_key=True)
    sos_id: Mapped[int] = mapped_column(ForeignKey("sos_requests.id", ondelete="CASCADE"), index=True)
    ack_type: Mapped[AckType] = mapped_column(_enum(AckType))
    acknowledged_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sos: Mapped[SOSRequest] = relationship(back_populates="acknowledgements")
    acknowledged_by: Mapped[User | None] = relationship()

    __table_args__ = (
        # A message gets exactly one server receipt and one coordinator ack.
        UniqueConstraint("sos_id", "ack_type", name="uq_ack_per_type"),
    )
