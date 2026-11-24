from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import require_coordinator
from app.database import get_db
from app.models import RescueAssignment, Volunteer
from app.schemas.volunteer import VolunteerCreate, VolunteerOut, VolunteerUpdate
from app.services.sos_service import ACTIVE_ASSIGNMENT

router = APIRouter(prefix="/api/volunteers", tags=["volunteers"], dependencies=[Depends(require_coordinator)])


def _out(db: Session, v: Volunteer) -> VolunteerOut:
    n = db.scalar(
        select(func.count()).select_from(RescueAssignment)
        .where(RescueAssignment.volunteer_id == v.id, RescueAssignment.status.in_(ACTIVE_ASSIGNMENT))
    )
    return VolunteerOut.model_validate(v).model_copy(update={"active_assignments": n or 0})


@router.get("", response_model=list[VolunteerOut])
def list_volunteers(db: Session = Depends(get_db)):
    return [_out(db, v) for v in db.scalars(select(Volunteer).order_by(Volunteer.status, Volunteer.name))]


@router.post("", response_model=VolunteerOut, status_code=201)
def create_volunteer(body: VolunteerCreate, db: Session = Depends(get_db)):
    v = Volunteer(**body.model_dump())
    db.add(v)
    db.commit()
    return _out(db, v)


@router.patch("/{volunteer_id}", response_model=VolunteerOut)
def update_volunteer(volunteer_id: int, body: VolunteerUpdate, db: Session = Depends(get_db)):
    v = db.get(Volunteer, volunteer_id)
    if v is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Volunteer not found")
    v.status = body.status
    db.commit()
    return _out(db, v)
