import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.security import require_coordinator
from app.database import get_db
from app.models import (
    AssignmentStatus, RescueAssignment, RescueStatus, SOSRequest, User, Volunteer, VolunteerStatus,
)
from app.routers._loaders import SOS_DETAIL_OPTIONS
from app.routers.acknowledgements import acknowledge
from app.schemas.volunteer import AssignmentCreate, AssignmentOut, AssignmentUpdate
from app.services import sos_service

router = APIRouter(prefix="/api/assignments", tags=["assignments"])

CLOSED = {RescueStatus.RESOLVED, RescueStatus.CANCELLED}


def _out(a: RescueAssignment) -> AssignmentOut:
    return AssignmentOut(
        id=a.id, message_id=str(a.sos.message_id), volunteer_id=a.volunteer_id,
        volunteer_name=a.volunteer.name, status=a.status, notes=a.notes,
        assigned_by=a.assigned_by.username if a.assigned_by else None,
        created_at=a.created_at, updated_at=a.updated_at,
    )


_A_OPTS = (
    selectinload(RescueAssignment.sos), selectinload(RescueAssignment.volunteer),
    selectinload(RescueAssignment.assigned_by),
)


@router.post("", response_model=AssignmentOut, status_code=201)
def create_assignment(body: AssignmentCreate, db: Session = Depends(get_db), user: User = Depends(require_coordinator)):
    try:
        mid = uuid.UUID(body.message_id)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "message_id must be a UUID")
    sos = db.scalar(select(SOSRequest).options(*SOS_DETAIL_OPTIONS).where(SOSRequest.message_id == mid))
    if sos is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "SOS not found")
    if sos.rescue_status in CLOSED:
        raise HTTPException(status.HTTP_409_CONFLICT, f"SOS is {sos.rescue_status.value}; re-open it first")
    vol = db.get(Volunteer, body.volunteer_id)
    if vol is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Volunteer not found")
    if vol.status == VolunteerStatus.OFF_DUTY:
        raise HTTPException(status.HTTP_409_CONFLICT, "Volunteer is off duty")
    if any(a.volunteer_id == vol.id and a.status in sos_service.ACTIVE_ASSIGNMENT for a in sos.assignments):
        raise HTTPException(status.HTTP_409_CONFLICT, "Volunteer is already assigned to this SOS")

    # Assigning implies the coordinator has seen the request.
    acknowledge(db, sos, user, None)
    a = RescueAssignment(sos=sos, volunteer=vol, assigned_by_user_id=user.id, notes=body.notes)
    db.add(a)
    vol.status = VolunteerStatus.BUSY
    if sos.rescue_status == RescueStatus.ACKNOWLEDGED:
        sos.rescue_status = RescueStatus.ASSIGNED
        sos_service.add_event(sos, "RESCUE_STATUS", "ACKNOWLEDGED", "ASSIGNED", user, f"Assigned {vol.name}")
    else:
        sos_service.add_event(sos, "ASSIGNMENT_ADDED", None, vol.name, user)
    db.commit()
    return _out(db.scalar(select(RescueAssignment).options(*_A_OPTS).where(RescueAssignment.id == a.id)))


@router.get("", response_model=list[AssignmentOut], dependencies=[Depends(require_coordinator)])
def list_assignments(db: Session = Depends(get_db), active_only: bool = False, message_id: uuid.UUID | None = None):
    q = select(RescueAssignment).options(*_A_OPTS).order_by(RescueAssignment.created_at.desc())
    if active_only:
        q = q.where(RescueAssignment.status.in_(sos_service.ACTIVE_ASSIGNMENT))
    if message_id:
        q = q.join(SOSRequest).where(SOSRequest.message_id == message_id)
    return [_out(a) for a in db.scalars(q)]


@router.patch("/{assignment_id}", response_model=AssignmentOut)
def update_assignment(
    assignment_id: int, body: AssignmentUpdate,
    db: Session = Depends(get_db), user: User = Depends(require_coordinator),
):
    a = db.scalar(select(RescueAssignment).options(*_A_OPTS).where(RescueAssignment.id == assignment_id))
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    if a.status not in sos_service.ACTIVE_ASSIGNMENT:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Assignment already {a.status.value}")
    old = a.status
    a.status = body.status
    if body.notes:
        a.notes = body.notes
    sos = a.sos
    sos_service.add_event(sos, "ASSIGNMENT_STATUS", old.value, body.status.value, user, f"{a.volunteer.name}")

    if body.status == AssignmentStatus.ON_SITE and sos.rescue_status == RescueStatus.ASSIGNED:
        sos.rescue_status = RescueStatus.IN_PROGRESS
        sos_service.add_event(sos, "RESCUE_STATUS", "ASSIGNED", "IN_PROGRESS", user, "Volunteer on site")
    if body.status in (AssignmentStatus.COMPLETED, AssignmentStatus.CANCELLED):
        a.volunteer.status = VolunteerStatus.AVAILABLE
        db.flush()
        still_active = any(x.status in sos_service.ACTIVE_ASSIGNMENT for x in sos.assignments)
        if not still_active and sos.rescue_status in (RescueStatus.ASSIGNED, RescueStatus.IN_PROGRESS):
            if body.status == AssignmentStatus.COMPLETED:
                sos.rescue_status, frm = RescueStatus.RESOLVED, sos.rescue_status
                sos_service.add_event(sos, "RESCUE_STATUS", frm.value, "RESOLVED", user, "Assignment completed")
            else:
                sos.rescue_status, frm = RescueStatus.ACKNOWLEDGED, sos.rescue_status
                sos_service.add_event(sos, "RESCUE_STATUS", frm.value, "ACKNOWLEDGED", user, "Assignment cancelled")
    db.commit()
    return _out(db.scalar(select(RescueAssignment).options(*_A_OPTS).where(RescueAssignment.id == a.id)))
