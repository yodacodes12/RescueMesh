#!/usr/bin/env bash
# Starts the RescueMesh Postgres container without docker compose.
# Reads credentials from ../.env (copy .env.example first).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; source "$ROOT/.env"; set +a
if docker ps -a --format '{{.Names}}' | grep -qx rescuemesh-db; then
  docker start rescuemesh-db >/dev/null
else
  docker run -d --name rescuemesh-db \
    -e POSTGRES_USER="$POSTGRES_USER" -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -e POSTGRES_DB="${POSTGRES_DB:-rescuemesh}" \
    -p "${POSTGRES_PORT:-5433}:5432" \
    -v rescuemesh-pgdata:/var/lib/postgresql/data \
    -v "$ROOT/backend/sql/init-test-db.sql:/docker-entrypoint-initdb.d/10-test-db.sql:ro" \
    postgres:16-alpine >/dev/null
fi
echo -n "Waiting for Postgres"
for _ in $(seq 1 40); do
  if docker exec rescuemesh-db pg_isready -U "$POSTGRES_USER" -d "${POSTGRES_DB:-rescuemesh}" >/dev/null 2>&1; then echo " ready."; exit 0; fi
  echo -n "."; sleep 1
done
echo " timed out"; exit 1
