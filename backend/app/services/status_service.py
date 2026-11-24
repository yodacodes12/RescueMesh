"""Rescue-operation state machine (coordinator side).

RECEIVED -> ACKNOWLEDGED -> ASSIGNED -> IN_PROGRESS -> RESOLVED
plus CANCELLED (false alarm / duplicate report) and controlled re-opening.
"""
from fastapi import HTTPException, status

from app.models import RescueStatus as R

ALLOWED: dict[R, set[R]] = {
    R.RECEIVED: {R.ACKNOWLEDGED, R.CANCELLED},
    R.ACKNOWLEDGED: {R.ASSIGNED, R.RESOLVED, R.CANCELLED},
    R.ASSIGNED: {R.IN_PROGRESS, R.ACKNOWLEDGED, R.RESOLVED, R.CANCELLED},
    R.IN_PROGRESS: {R.RESOLVED, R.ASSIGNED, R.CANCELLED},
    R.RESOLVED: {R.ACKNOWLEDGED},   # re-open
    R.CANCELLED: {R.ACKNOWLEDGED},  # re-open
}


def check_transition(current: R, target: R) -> None:
    if target == current:
        return
    if target not in ALLOWED[current]:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot change rescue status from {current.value} to {target.value}",
        )
