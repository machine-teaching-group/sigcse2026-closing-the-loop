#!/usr/bin/env sh
set -e

if [ "${RUN_DB_MIGRATIONS:-1}" = "1" ]; then
  if [ "${RUN_DB_MAKEMIGRATIONS:-0}" = "1" ]; then
    echo "[entrypoint] Running makemigrations..."
    python manage.py makemigrations --noinput || true
  fi
  echo "[entrypoint] Running migrate..."
  python manage.py migrate --noinput
fi

echo "[entrypoint] Starting: $@"
if [ -n "${LOG_FILE_PREFIX:-}" ]; then
  echo "[entrypoint] LOG_FILE_PREFIX='${LOG_FILE_PREFIX}'"
fi
exec "$@"
