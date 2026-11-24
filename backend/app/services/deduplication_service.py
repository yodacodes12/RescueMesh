"""Duplicate detection for SOS messages.

In a mesh the same SOS is expected to reach the server several times (every
gateway that holds a copy uploads it). Identity is the client-generated UUID
`message_id`, enforced by a UNIQUE index. A duplicate is not an error: we merge
any relay hops we had not seen yet (a second path tells coordinators more about
how the message travelled) and return the current status so the gateway can
propagate it back into the mesh.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import MessageRelayHistory, SOSRequest
from app.schemas.sos import SOSMessageIn


def find_existing(db: Session, message_id: uuid.UUID) -> SOSRequest | None:
    return db.scalar(select(SOSRequest).where(SOSRequest.message_id == message_id))


def merge_duplicate(db: Session, existing: SOSRequest, msg: SOSMessageIn) -> int:
    """Record a repeat delivery. Returns the number of new relay hops merged."""
    known = {(h.hop_index, h.device_id) for h in existing.relay_history}
    added = 0
    for hop in msg.relay_history:
        if (hop.hop, hop.device_id) not in known:
            existing.relay_history.append(
                MessageRelayHistory(
                    hop_index=hop.hop,
                    device_id=hop.device_id,
                    device_name=hop.device_name,
                    transport=hop.transport,
                    received_at=hop.received_at,
                )
            )
            known.add((hop.hop, hop.device_id))
            added += 1
    existing.duplicate_receipts += 1
    return added
