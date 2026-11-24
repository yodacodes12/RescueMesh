"""Tests run against a real PostgreSQL database (TEST_DATABASE_URL), because
the duplicate-protection guarantees rely on Postgres constraints."""
import os
from datetime import datetime, timedelta, timezone
import uuid

import pytest
from dotenv_shim import load_test_env

load_test_env()

from fastapi.testclient import TestClient  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, UserRole, Volunteer  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        db.add(User(username="coord", full_name="Test Coordinator",
                    hashed_password=hash_password("coordpass123"), role=UserRole.COORDINATOR))
        db.add(Volunteer(name="Vol One", team_name="Boat 1"))
        db.add(Volunteer(name="Vol Two", team_name="Medics"))
        db.commit()
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth(client):
    r = client.post("/api/auth/login", data={"username": "coord", "password": "coordpass123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def make_msg(**over):
    now = datetime.now(timezone.utc)
    msg = {
        "message_id": str(uuid.uuid4()),
        "sender_id": "device-A-0001",
        "sender_name": "Person A",
        "emergency_type": "FLOOD",
        "priority": "HIGH",
        "latitude": 9.4981,
        "longitude": 76.3388,
        "description": "Water rising, family of 4 on roof",
        "people_affected": 4,
        "created_at": now.isoformat(),
        "expiry_at": (now + timedelta(hours=24)).isoformat(),
        "hop_count": 0,
        "relay_history": [
            {"device_id": "device-A-0001", "hop": 0, "transport": "LOCAL", "received_at": now.isoformat()}
        ],
    }
    msg.update(over)
    return msg
