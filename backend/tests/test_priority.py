from datetime import datetime, timedelta, timezone

from app.models import Priority
from app.services.priority_service import priority_score


def test_ageing_prevents_starvation_but_never_beats_fresh_critical():
    now = datetime.now(timezone.utc)
    fresh_high = priority_score(Priority.HIGH, now, now)
    old_low = priority_score(Priority.LOW, now - timedelta(hours=5), now)
    ancient_low = priority_score(Priority.LOW, now - timedelta(days=3), now)
    fresh_critical = priority_score(Priority.CRITICAL, now, now)
    assert old_low >= fresh_high
    assert ancient_low < fresh_critical
