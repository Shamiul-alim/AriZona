#!/bin/sh
set -e

# -----------------------------------------------------------------------------
# Applies pending migrations before the API starts.
#
# `migrate deploy` only ever plays forward already-generated migrations — it
# never generates, resets or drops anything, which is what makes it safe to run
# unattended on every container start.
#
# Set RUN_MIGRATIONS=false to skip this (for example when a separate job owns
# the schema).
# -----------------------------------------------------------------------------

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] Applying database migrations..."

  # Postgres may still be accepting connections a moment after the healthcheck
  # passes, so retry briefly rather than crash-looping the container.
  attempt=1
  max_attempts=10
  until npx prisma migrate deploy; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "[entrypoint] Migrations failed after ${max_attempts} attempts." >&2
      exit 1
    fi
    echo "[entrypoint] Migration attempt ${attempt} failed; retrying in 3s..."
    attempt=$((attempt + 1))
    sleep 3
  done

  echo "[entrypoint] Migrations applied."
fi

# Demo media ships inside the image, but the uploads directory is a volume that
# hides it. Copy it across once so seeded episodes have something to play.
if [ -d /app/demo-media ] && [ ! -f /app/storage/uploads/demo/sub-720p.mp4 ]; then
  echo "[entrypoint] Installing demo media into the uploads volume..."
  mkdir -p /app/storage/uploads/demo
  cp -r /app/demo-media/. /app/storage/uploads/demo/
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] Seeding database..."
  # Idempotent (upserts throughout), but opt-in so a production deploy never
  # rewrites live data by accident.
  node dist-seed/seed.js || echo "[entrypoint] Seed failed; continuing."
fi

echo "[entrypoint] Starting: $*"
exec "$@"
