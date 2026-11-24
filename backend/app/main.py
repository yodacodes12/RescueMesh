"""RescueMesh API entrypoint.  Run:  uv run uvicorn app.main:app --reload"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import get_settings
from app.database import engine
from app.routers import acknowledgements, assignments, dashboard, sos, users, volunteers

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

settings = get_settings()
app = FastAPI(
    title="RescueMesh API",
    version="0.1.0",
    description=(
        "Rescue-coordination backend for RescueMesh. Device endpoints accept SOS messages "
        "directly or via internet gateways; coordinator endpoints require a bearer token."
    ),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)

for r in (users, sos, acknowledgements, assignments, volunteers, dashboard):
    app.include_router(r.router)


@app.get("/api/health", tags=["meta"])
def health():
    """Used by phones to decide whether they can act as an internet gateway."""
    with engine.connect() as c:
        c.execute(text("select 1"))
    return {"status": "ok", "service": "rescuemesh", "max_hop_count": settings.max_hop_count}
