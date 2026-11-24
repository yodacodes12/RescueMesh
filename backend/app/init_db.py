"""Create tables and the first admin account.

    uv run python -m app.init_db            # create schema + admin
    uv run python -m app.init_db --reset    # DROP everything first (dev only)

For a hackathon prototype `create_all` is the initialisation mechanism; the
equivalent DDL is exported to sql/schema.sql for review (see README).
"""
import argparse
import secrets

from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import hash_password
from app.database import Base, SessionLocal, engine
from app.models import User, UserRole


def init(reset: bool = False) -> None:
    if reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    s = get_settings()
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.username == s.admin_username)):
            print(f"Schema ready. Admin '{s.admin_username}' already exists.")
            return
        password = s.admin_password or secrets.token_urlsafe(12)
        db.add(User(username=s.admin_username, full_name="RescueMesh Administrator",
                    hashed_password=hash_password(password), role=UserRole.ADMIN))
        db.commit()
        print(f"Schema ready. Created admin '{s.admin_username}'.")
        if not s.admin_password:
            print(f"Generated password (shown once, store it safely): {password}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--reset", action="store_true", help="drop all tables first")
    init(p.parse_args().reset)
