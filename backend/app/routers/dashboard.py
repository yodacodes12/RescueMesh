from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import require_coordinator
from app.database import get_db
from app.models import IngestChannel, Priority, RescueStatus, SOSRequest, Volunteer, VolunteerStatus
from app.schemas.dashboard import DashboardStats
from app.services.sos_service import now_utc

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(require_coordinator)])


@router.get("/stats", response_model=DashboardStats)
def stats(db: Session = Depends(get_db)):
    def count(*where) -> int:
        return db.scalar(select(func.count()).select_from(SOSRequest).where(*where)) or 0

    by_status = dict(db.execute(select(SOSRequest.rescue_status, func.count()).group_by(SOSRequest.rescue_status)).all())
    by_priority = dict(db.execute(select(SOSRequest.priority, func.count()).group_by(SOSRequest.priority)).all())
    by_type = dict(db.execute(select(SOSRequest.emergency_type, func.count()).group_by(SOSRequest.emergency_type)).all())
    g = lambda d, k: d.get(k, 0)  # noqa: E731
    return DashboardStats(
        total=count(),
        critical_open=count(
            SOSRequest.priority == Priority.CRITICAL,
            SOSRequest.rescue_status.notin_([RescueStatus.RESOLVED, RescueStatus.CANCELLED]),
        ),
        pending=g(by_status, RescueStatus.RECEIVED),
        acknowledged=g(by_status, RescueStatus.ACKNOWLEDGED),
        assigned=g(by_status, RescueStatus.ASSIGNED) + g(by_status, RescueStatus.IN_PROGRESS),
        resolved=g(by_status, RescueStatus.RESOLVED),
        cancelled=g(by_status, RescueStatus.CANCELLED),
        via_gateway=count(SOSRequest.received_via == IngestChannel.GATEWAY),
        via_direct=count(SOSRequest.received_via == IngestChannel.DIRECT),
        simulated=count(SOSRequest.is_simulated.is_(True)),
        by_priority={p.value: g(by_priority, p) for p in Priority},
        by_type={k.value: v for k, v in by_type.items()},
        volunteers_available=db.scalar(
            select(func.count()).select_from(Volunteer).where(Volunteer.status == VolunteerStatus.AVAILABLE)
        ) or 0,
        volunteers_total=db.scalar(select(func.count()).select_from(Volunteer)) or 0,
        generated_at=now_utc(),
    )
