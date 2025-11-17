#!/usr/bin/env sh
set -e

# Optionally run makemigrations before migrate
if [ "${RUN_DB_MIGRATIONS:-1}" = "1" ]; then
  if [ "${RUN_DB_MAKEMIGRATIONS:-0}" = "1" ]; then
    echo "[entrypoint] Running makemigrations..."
    # Run non-interactively; ignore if no changes or other benign messages
    python manage.py makemigrations --noinput || true
  fi
  echo "[entrypoint] Running migrate..."
  python manage.py migrate --noinput
fi

echo "[entrypoint] Starting: $@"
exec "$@"
