from datetime import datetime

from pydantic import BaseModel


class DashboardStats(BaseModel):
    total: int
    critical_open: int
    pending: int        # received but not yet acknowledged
    acknowledged: int
    assigned: int       # ASSIGNED + IN_PROGRESS
    resolved: int
    cancelled: int
    via_gateway: int
    via_direct: int
    simulated: int
    by_priority: dict[str, int]
    by_type: dict[str, int]
    volunteers_available: int
    volunteers_total: int
    generated_at: datetime
