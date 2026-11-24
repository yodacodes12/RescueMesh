"""Point the app at TEST_DATABASE_URL before it is imported."""
import os
from pathlib import Path


def load_test_env() -> None:
    env = Path(__file__).resolve().parents[1] / ".env"
    values = {}
    if env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                values[k.strip()] = v.strip()
    test_url = os.environ.get("TEST_DATABASE_URL") or values.get("TEST_DATABASE_URL")
    if not test_url:
        raise RuntimeError("TEST_DATABASE_URL must be set (see backend/.env.example)")
    os.environ["DATABASE_URL"] = test_url
    os.environ.setdefault("JWT_SECRET", values.get("JWT_SECRET") or "test-secret-" + "x" * 40)
