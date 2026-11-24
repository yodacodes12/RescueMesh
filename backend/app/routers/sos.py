"""SOS endpoints.

Device-facing (no login - an emergency must never fail on authentication):
    POST /api/sos               direct submission from the originating phone
    POST /api/sos/sync          batch upload from a gateway phone
    POST /api/sos/status-query  delivery/rescue status for known message ids (no PII)

Coordinator-facing (JWT, COORDINATOR or ADMIN role):
    GET   /api/sos, GET /api/sos/{id}, PATCH /api/sos/{id}/status, PATCH /api/sos/{id}/priority
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import require_coordinator
from app.database import get_db
from app.models import AssignmentStatus, Priority, RescueStatus, SOSRequest, User, VolunteerStatus
from app.routers._loaders import SOS_DETAIL_OPTIONS, SOS_LIST_OPTIONS
from app.schemas.sos import (
    MessageStatus, PriorityUpdate, RescueStatusUpdate, SOSDetail, SOSIngestResult, SOSMessageIn,
    SOSOut, StatusQuery, StatusQueryResponse, SyncRequest, SyncResponse,
)
from app.services import sos_service
from app.services.status_service import check_transition

router = APIRouter(prefix="/api/sos", tags=["sos"])


@router.post(
    "", response_model=SOSIngestResult, status_code=201,
    responses={200: {"description": "Duplicate - already received"}, 422: {"description": "Rejected"}},
)
def create_sos(msg: SOSMessageIn, response: Response, db: Session = Depends(get_db)):
    """Direct submission by the phone that created the SOS. Idempotent on message_id."""
    result = sos_service.ingest(db, msg)
    if result.result == "duplicate":
        response.status_code = status.HTTP_200_OK
    elif result.result == "rejected":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, result.reason)
    return result


@router.post("/sync", response_model=SyncResponse)
def sync_sos(body: SyncRequest, db: Session = Depends(get_db)):
    """Gateway upload of messages collected over the mesh.

    Each message is processed independently: one bad message never blocks the
    rest of the batch. The per-message results tell the gateway which messages
    the server now holds, so it can mark them SERVER_RECEIVED locally.
    """
    if len(body.messages) > get_settings().max_sync_batch:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Batch too large")
    results = [
        sos_service.ingest(db, m, body.gateway_device_id, body.gateway_name, body.is_simulated)
        for m in body.messages
    ]
    return SyncResponse(
        results=results,
        created=sum(r.result == "created" for r in results),
        duplicates=sum(r.result == "duplicate" for r in results),
        rejected=sum(r.result == "rejected" for r in results),
        server_time=sos_service.now_utc(),
    )


@router.post("/status-query", response_model=StatusQueryResponse)
def status_query(body: StatusQuery, db: Session = Depends(get_db)):
    """Lets any phone learn what happened to messages it holds, so acknowledgements
    can flow back over the mesh to the originating device. Returns no location
    or description, so it is safe without authentication."""
    rows = db.scalars(select(SOSRequest).where(SOSRequest.message_id.in_(body.message_ids))).all()
    found = {r.message_id for r in rows}
    return StatusQueryResponse(
        statuses=[
            MessageStatus(
                message_id=r.message_id, delivery_status=r.delivery_status,
                rescue_status=r.rescue_status, priority=r.priority, updated_at=r.updated_at,
            )
            for r in rows
        ],
        unknown=[m for m in body.message_ids if m not in found],
        server_time=sos_service.now_utc(),
    )


@router.get("", response_model=list[SOSOut], dependencies=[Depends(require_coordinator)])
def list_sos(
    db: Session = Depends(get_db),
    priority: Priority | None = None,
    rescue_status: RescueStatus | None = None,
    open_only: bool = Query(False, description="Exclude RESOLVED and CANCELLED"),
    include_simulated: bool = True,
    sort: str = Query("priority", pattern="^(priority|newest)$"),
    limit: int = Query(500, ge=1, le=2000),
):
    q = select(SOSRequest).options(*SOS_LIST_OPTIONS)
    if priority:
        q = q.where(SOSRequest.priority == priority)
    if rescue_status:
        q = q.where(SOSRequest.rescue_status == rescue_status)
    if open_only:
        q = q.where(SOSRequest.rescue_status.notin_([RescueStatus.RESOLVED, RescueStatus.CANCELLED]))
    if not include_simulated:
        q = q.where(SOSRequest.is_simulated.is_(False))
    rows = db.scalars(q.order_by(SOSRequest.received_at.desc()).limit(limit)).all()
    now = sos_service.now_utc()
    out = [sos_service.to_out(r, now) for r in rows]
    if sort == "priority":
        out.sort(key=lambda s: s.priority_score, reverse=True)
    return out


def _load(db: Session, message_id: uuid.UUID) -> SOSRequest:
    sos = db.scalar(select(SOSRequest).options(*SOS_DETAIL_OPTIONS).where(SOSRequest.message_id == message_id))
    if sos is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "SOS not found")
    return sos


@router.get("/{message_id}", response_model=SOSDetail, dependencies=[Depends(require_coordinator)])
def get_sos(message_id: uuid.UUID, db: Session = Depends(get_db)):
    return sos_service.to_detail(_load(db, message_id))


@router.patch("/{message_id}/status", response_model=SOSDetail)
def update_status(
    message_id: uuid.UUID, body: RescueStatusUpdate,
    db: Session = Depends(get_db), user: User = Depends(require_coordinator),
):
    sos = _load(db, message_id)
    current = sos.rescue_status
    check_transition(current, body.rescue_status)
    if body.rescue_status == current:
        return sos_service.to_detail(sos)
    if body.rescue_status in (RescueStatus.ASSIGNED, RescueStatus.IN_PROGRESS) and not sos_service.active_assignment(sos):
        raise HTTPException(status.HTTP_409_CONFLICT, "Assign a volunteer first (POST /api/assignments)")

    if body.rescue_status in (RescueStatus.RESOLVED, RescueStatus.CANCELLED, RescueStatus.ACKNOWLEDGED):
        # Close out any field assignments still open and free the volunteers.
        final = AssignmentStatus.COMPLETED if body.rescue_status == RescueStatus.RESOLVED else AssignmentStatus.CANCELLED
        for a in sos.assignments:
            if a.status in sos_service.ACTIVE_ASSIGNMENT:
                a.status = final
                a.volunteer.status = VolunteerStatus.AVAILABLE
    sos.rescue_status = body.rescue_status
    sos_service.add_event(sos, "RESCUE_STATUS", current.value, body.rescue_status.value, user, body.note)
    db.commit()
    return sos_service.to_detail(_load(db, message_id))


@router.patch("/{message_id}/priority", response_model=SOSDetail)
def update_priority(
    message_id: uuid.UUID, body: PriorityUpdate,
    db: Session = Depends(get_db), user: User = Depends(require_coordinator),
):
    """Coordinator review of the sender-chosen priority. The original is kept."""
    sos = _load(db, message_id)
    if sos.priority != body.priority:
        sos_service.add_event(sos, "PRIORITY_CHANGED", sos.priority.value, body.priority.value, user, body.note)
        sos.priority = body.priority
        db.commit()
    return sos_service.to_detail(_load(db, message_id))
