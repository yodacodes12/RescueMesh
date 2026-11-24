"""Application settings, loaded from environment variables / backend/.env.

No secret has a default value: the app refuses to start without JWT_SECRET and
DATABASE_URL, so credentials can never silently fall back to something hardcoded.
"""
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    jwt_secret: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480
    cors_origins: str = "http://localhost:5173"

    # Mesh protocol limits. These must match mobile/src/mesh/core/constants.ts.
    max_hop_count: int = 8
    max_message_age_hours: int = 72
    max_clock_skew_minutes: int = 15
    max_sync_batch: int = 200

    admin_username: str = "admin"
    admin_password: str = ""

    @field_validator("database_url")
    @classmethod
    def _require_postgres(cls, v: str) -> str:
        if not v.startswith("postgresql"):
            raise ValueError("RescueMesh requires PostgreSQL (postgresql+psycopg://...)")
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
