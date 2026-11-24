"""SOS ingestion and read-model assembly."""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import (
    AckType, AssignmentStatus, DeliveryAcknowledgement, Device, IngestChannel,
    MessageRelayHistory, RelayTransport, RescueAssignment, SOSRequest, SOSStatusEvent, User,
)
from app.schemas.sos import (
    AckOut, AssignmentBrief, SOSDetail, SOSIngestResult, SOSMessageIn, SOSOut,
    StatusEventOut, RelayHopOut,
)
from app.services import deduplication_service
from app.services.priority_service import priority_score

# Never log descriptions, names or coordinates: only ids and outcomes.
log = logging.getLogger("rescuemesh.sos")

ACTIVE_ASSIGNMENT = {AssignmentStatus.ASSIGNED, AssignmentStatus.EN_ROUTE, AssignmentStatus.ON_SITE}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def upsert_device(db: Session, device_id: str, name: str | None, simulated: bool) -> Device:
    dev = db.scalar(select(Device).where(Device.device_id == device_id))
    if dev is None:
        dev = Device(device_id=device_id, display_name=name, is_simulated=simulated)
        db.add(dev)
        db.flush()
    else:
        dev.last_seen_at = now_utc()
        if name:
            dev.display_name = name
    return dev


def validate_for_ingest(msg: SOSMessageIn, now: datetime) -> str | None:
    """Returns a rejection reason, or None if the message is acceptable."""
    s = get_settings()
    if msg.created_at > now + timedelta(minutes=s.max_clock_skew_minutes):
        return "created_at is in the future (device clock wrong?)"
    if msg.expiry_at <= now:
        return "expired"
    if msg.expiry_at - msg.created_at > timedelta(hours=s.max_message_age_hours):
        return f"expiry window exceeds {s.max_message_age_hours}h"
    if msg.hop_count > s.max_hop_count:
        return f"hop_count exceeds {s.max_hop_count}"
    return None


def ingest(
    db: Session,
    msg: SOSMessageIn,
    gateway_device_id: str | None = None,
    gateway_name: str | None = None,
    gateway_simulated: bool = False,
) -> SOSIngestResult:
    """Store one SOS idempotently. Commits on success."""
    now = now_utc()
    existing = deduplication_service.find_existing(db, msg.message_id)
    if existing is not None:
        added = deduplication_service.merge_duplicate(db, existing, msg)
        db.commit()
        log.info("duplicate sos %s (merged %d hops)", msg.message_id, added)
        return _result(existing, "duplicate")

    reason = validate_for_ingest(msg, now)
    if reason:
        log.info("rejected sos %s: %s", msg.message_id, reason)
        return SOSIngestResult(message_id=msg.message_id, result="rejected", reason=reason)

    sender = upsert_device(db, msg.sender_id, msg.sender_name, msg.is_simulated)
    via_gateway = gateway_device_id is not None and gateway_device_id != msg.sender_id
    gateway = (
        upsert_device(db, gateway_device_id, gateway_name, gateway_simulated) if via_gateway else None
    )

    sos = SOSRequest(
        message_id=msg.message_id,
        sender_device_id=sender.id,
        sender_name=msg.sender_name,
        emergency_type=msg.emergency_type,
        priority=msg.priority,
        original_priority=msg.priority,
        latitude=msg.latitude,
        longitude=msg.longitude,
        location_accuracy_m=msg.location_accuracy_m,
        description=msg.description,
        people_affected=msg.people_affected,
        device_created_at=msg.created_at,
        expiry_at=msg.expiry_at,
        hop_count=msg.hop_count,
        is_simulated=msg.is_simulated or gateway_simulated,
        received_via=IngestChannel.GATEWAY if via_gateway else IngestChannel.DIRECT,
        gateway_device_id=gateway.id if gateway else None,
    )
    seen: set[tuple[int, str]] = set()
    for hop in msg.relay_history:
        if (hop.hop, hop.device_id) in seen:
            continue
        seen.add((hop.hop, hop.device_id))
        sos.relay_history.append(
            MessageRelayHistory(
                hop_index=hop.hop, device_id=hop.device_id, device_name=hop.device_name,
                transport=hop.transport, received_at=hop.received_at,
            )
        )
    # Final hop: the upload over the internet to this server.
    uploader_id = gateway_device_id or msg.sender_id
    sos.relay_history.append(
        MessageRelayHistory(
            hop_index=max([h.hop for h in msg.relay_history], default=0) + 1,
            device_id=uploader_id,
            device_name=gateway_name if via_gateway else msg.sender_name,
            transport=RelayTransport.INTERNET,
            received_at=now,
        )
    )
    sos.acknowledgements.append(DeliveryAcknowledgement(ack_type=AckType.SERVER_RECEIPT))
    sos.status_events.append(
        SOSStatusEvent(
            event="SERVER_RECEIVED",
            to_value="RECEIVED",
            note=f"via {'gateway ' + gateway_device_id if via_gateway else 'direct upload'}",
        )
    )

    # Savepoint so a concurrent insert of the same message_id becomes a duplicate,
    # not a 500 error.
    try:
        with db.begin_nested():
            db.add(sos)
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = deduplication_service.find_existing(db, msg.message_id)
        if existing is None:
            raise
        deduplication_service.merge_duplicate(db, existing, msg)
        db.commit()
        return _result(existing, "duplicate")

    log.info("created sos %s priority=%s via=%s", msg.message_id, msg.priority.value, sos.received_via.value)
    return _result(sos, "created")


def _result(sos: SOSRequest, result: str) -> SOSIngestResult:
    return SOSIngestResult(
        message_id=sos.message_id, result=result,
        delivery_status=sos.delivery_status, rescue_status=sos.rescue_status,
    )


def get_by_message_id(db: Session, message_id: uuid.UUID) -> SOSRequest | None:
    return db.scalar(select(SOSRequest).where(SOSRequest.message_id == message_id))


def add_event(sos: SOSRequest, event: str, frm: str | None, to: str | None, user: User | None, note: str | None = None):
    sos.status_events.append(
        SOSStatusEvent(event=event, from_value=frm, to_value=to, note=note, actor_user_id=user.id if user else None)
    )


def _brief(a: RescueAssignment) -> AssignmentBrief:
    return AssignmentBrief(
        id=a.id, volunteer_id=a.volunteer_id, volunteer_name=a.volunteer.name, status=a.status,
        notes=a.notes, created_at=a.created_at, updated_at=a.updated_at,
    )


def active_assignment(sos: SOSRequest) -> RescueAssignment | None:
    active = [a for a in sos.assignments if a.status in ACTIVE_ASSIGNMENT]
    return active[-1] if active else None


def to_out(sos: SOSRequest, now: datetime | None = None) -> SOSOut:
    act = active_assignment(sos)
    return SOSOut(
        message_id=sos.message_id,
        sender_id=sos.sender_device.device_id,
        sender_name=sos.sender_name,
        emergency_type=sos.emergency_type,
        priority=sos.priority,
        original_priority=sos.original_priority,
        latitude=sos.latitude,
        longitude=sos.longitude,
        location_accuracy_m=sos.location_accuracy_m,
        description=sos.description,
        people_affected=sos.people_affected,
        created_at=sos.device_created_at,
        expiry_at=sos.expiry_at,
        received_at=sos.received_at,
        updated_at=sos.updated_at,
        hop_count=sos.hop_count,
        received_via=sos.received_via,
        gateway_id=sos.gateway_device.device_id if sos.gateway_device else None,
        is_simulated=sos.is_simulated,
        duplicate_receipts=sos.duplicate_receipts,
        delivery_status=sos.delivery_status,
        rescue_status=sos.rescue_status,
        active_assignment=_brief(act) if act else None,
        priority_score=round(priority_score(sos.priority, sos.device_created_at, now), 1),
    )


def to_detail(sos: SOSRequest) -> SOSDetail:
    base = to_out(sos).model_dump()
    return SOSDetail(
        **base,
        relay_history=[RelayHopOut.model_validate(h) for h in sos.relay_history],
        status_events=[
            StatusEventOut(
                id=e.id, event=e.event, from_value=e.from_value, to_value=e.to_value, note=e.note,
                actor_username=e.actor.username if e.actor else None, created_at=e.created_at,
            )
            for e in sos.status_events
        ],
        acknowledgements=[
            AckOut(
                id=a.id, ack_type=a.ack_type, note=a.note, created_at=a.created_at,
                acknowledged_by_username=a.acknowledged_by.username if a.acknowledged_by else None,
            )
            for a in sos.acknowledgements
        ],
        assignments=[_brief(a) for a in sos.assignments],
    )
