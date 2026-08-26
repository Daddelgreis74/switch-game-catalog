#!/bin/sh
set -e

# Ensure required directories exist
mkdir -p /config /app/public/cache /app/db /app/data /games /tmp/switch_uploads 2>/dev/null || true

# Ensure open permissions so any user (including TrueNAS apps UID 568) can write out-of-the-box
chmod -R 777 /app/public/cache /app/db /app/data /tmp 2>/dev/null || true
if [ -w /config ]; then
    chmod -R 777 /config 2>/dev/null || true
fi

exec "$@"
