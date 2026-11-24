import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import require_coordinator
from app.database import get_db
from app.models import AckType, DeliveryAcknowledgement, DeliveryStatus, RescueStatus, User
from app.routers._loaders import SOS_DETAIL_OPTIONS
from app.models import SOSRequest
from app.schemas.sos import AcknowledgeIn, SOSDetail
from app.services import sos_service

router = APIRouter(prefix="/api/sos", tags=["acknowledgements"])


def acknowledge(db: Session, sos: SOSRequest, user: User, note: str | None) -> bool:
    """Idempotent. Returns True if this call created the acknowledgement."""
    if any(a.ack_type == AckType.COORDINATOR_ACK for a in sos.acknowledgements):
        return False
    sos.acknowledgements.append(
        DeliveryAcknowledgement(ack_type=AckType.COORDINATOR_ACK, acknowledged_by_user_id=user.id, note=note)
    )
    sos.delivery_status = DeliveryStatus.COORDINATOR_ACKNOWLEDGED
    sos_service.add_event(sos, "COORDINATOR_ACK", DeliveryStatus.SERVER_RECEIVED.value,
                          DeliveryStatus.COORDINATOR_ACKNOWLEDGED.value, user, note)
    if sos.rescue_status == RescueStatus.RECEIVED:
        sos.rescue_status = RescueStatus.ACKNOWLEDGED
        sos_service.add_event(sos, "RESCUE_STATUS", RescueStatus.RECEIVED.value, RescueStatus.ACKNOWLEDGED.value, user)
    return True


@router.post("/{message_id}/acknowledge", response_model=SOSDetail)
def acknowledge_sos(
    message_id: uuid.UUID, body: AcknowledgeIn | None = None,
    db: Session = Depends(get_db), user: User = Depends(require_coordinator),
):
    q = select(SOSRequest).options(*SOS_DETAIL_OPTIONS).where(SOSRequest.message_id == message_id)
    sos = db.scalar(q)
    if sos is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "SOS not found")
    if acknowledge(db, sos, user, body.note if body else None):
        db.commit()
    return sos_service.to_detail(db.scalar(q.execution_options(populate_existing=True)))
