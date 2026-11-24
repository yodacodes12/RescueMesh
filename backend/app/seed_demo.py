"""Seed DEMO volunteers for the hackathon scenario.

Every row created here has is_demo=True and is shown with a DEMO badge on the
dashboard. No SOS requests are seeded: those must arrive through the real API
(from the app, or from mobile/scripts/demo-scenario.ts).

    uv run python -m app.seed_demo
"""
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Volunteer

# Around a fictional flood-affected village (coordinates near Kuttanad, Kerala).
DEMO_VOLUNTEERS = [
    dict(name="Anil Kumar", team_name="Boat Rescue Team 1", skills="Boat, swimming", latitude=9.4981, longitude=76.3388),
    dict(name="Priya Nair", team_name="Medical Response", skills="Paramedic, first aid", latitude=9.5040, longitude=76.3290),
    dict(name="Ravi Menon", team_name="Boat Rescue Team 2", skills="Boat, rope rescue", latitude=9.4895, longitude=76.3452),
    dict(name="Fatima S.", team_name="Relief Supplies", skills="Food & water logistics", latitude=9.5102, longitude=76.3401),
    dict(name="Joseph T.", team_name="Fire & Rescue", skills="Fire, structural", latitude=9.4930, longitude=76.3320),
]


def seed() -> None:
    with SessionLocal() as db:
        existing = set(db.scalars(select(Volunteer.name).where(Volunteer.is_demo.is_(True))))
        added = 0
        for v in DEMO_VOLUNTEERS:
            if v["name"] not in existing:
                db.add(Volunteer(**v, is_demo=True))
                added += 1
        db.commit()
        print(f"Seeded {added} demo volunteers ({len(existing)} already present).")


if __name__ == "__main__":
    seed()
