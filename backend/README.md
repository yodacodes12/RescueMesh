# RescueMesh – backend

FastAPI + SQLAlchemy + PostgreSQL. See the [project README](../README.md) §1 and §4.5.

```bash
uv sync && uv run python -m app.init_db && uv run python -m app.seed_demo
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000   # Swagger: /docs
uv run pytest
```
