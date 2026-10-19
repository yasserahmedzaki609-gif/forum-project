#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# 1. Ensure directories exist
# ---------------------------------------------------------------------------
mkdir -p /app/data /app/certs /app/media

# ---------------------------------------------------------------------------
# 2. Fix volume ownership (Docker volumes are created as root by default)
# ---------------------------------------------------------------------------
chown -R 1001:1001 /app/data /app/certs /app/media

# ---------------------------------------------------------------------------
# 3. Generate self-signed certificates if missing
# ---------------------------------------------------------------------------
if [ ! -f /app/certs/cert.pem ] || [ ! -f /app/certs/key.pem ]; then
  echo "[entrypoint] Generating self-signed certificates..."
  openssl req -nodes -new -x509 \
    -keyout /app/certs/key.pem \
    -out /app/certs/cert.pem \
    -days "${CERT_DAYS:-365}" \
    -subj "/C=${CERT_C:-EG}/ST=${CERT_ST:-Cairo}/L=${CERT_L:-Cairo}/O=${CERT_O:-Forum}/CN=${CERT_CN:-localhost}"
  chown 1001:1001 /app/certs/key.pem /app/certs/cert.pem
fi

# ---------------------------------------------------------------------------
# 4. Drop privileges to UID 1001 and run the app
# ---------------------------------------------------------------------------
# Using numeric UID:GID avoids getpwnam lookup that can fail on Alpine.
exec su-exec 1001:1001 "$@"