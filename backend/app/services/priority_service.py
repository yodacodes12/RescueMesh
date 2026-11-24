"""Priority scoring.

Same formula as mobile/src/mesh/core/priority.ts, so the dashboard's ordering
matches the order in which phones forward messages over the mesh.

    score = base_weight(priority) + min(age_minutes * AGE_WEIGHT, AGE_CAP)

The age term ("ageing") stops low-priority requests from being starved forever:
a LOW request that has waited 5 hours scores like a brand-new HIGH one, but no
amount of waiting lets anything outrank a fresh CRITICAL request.
"""
from datetime import datetime, timezone

from app.models import EmergencyType, Priority

BASE_WEIGHT = {
    Priority.CRITICAL: 1000,
    Priority.HIGH: 700,
    Priority.MEDIUM: 400,
    Priority.LOW: 100,
}
AGE_WEIGHT_PER_MINUTE = 2.0
AGE_CAP = 600.0

# Default suggestion shown to the user; they (and coordinators) can override it.
SUGGESTED_PRIORITY = {
    EmergencyType.MEDICAL: Priority.CRITICAL,
    EmergencyType.TRAPPED: Priority.CRITICAL,
    EmergencyType.FIRE: Priority.HIGH,
    EmergencyType.FLOOD: Priority.HIGH,
    EmergencyType.OTHER: Priority.MEDIUM,
}


def priority_score(priority: Priority, created_at: datetime, now: datetime | None = None) -> float:
    now = now or datetime.now(timezone.utc)
    age_min = max(0.0, (now - created_at).total_seconds() / 60.0)
    return BASE_WEIGHT[priority] + min(age_min * AGE_WEIGHT_PER_MINUTE, AGE_CAP)


def suggest_priority(emergency_type: EmergencyType) -> Priority:
    return SUGGESTED_PRIORITY[emergency_type]
