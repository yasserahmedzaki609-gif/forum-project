#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# 1. Ensure directories exist
# ---------------------------------------------------------------------------
mkdir -p /app/data /app/certs /app/media

# ---------------------------------------------------------------------------
# 2. Force /app/certs to be owned by root before openssl
# ---------------------------------------------------------------------------
# F04-FIX (C7 root cause): The Dockerfile does `chown -R app:app /app`, which
# makes /app/certs owned by 1001:1001 inside the image. When Docker creates
# a fresh volume at /app/certs, it copies the image's ownership -- so the
# fresh volume starts as 1001:1001, not root:root.
#
# With DAC_OVERRIDE removed (C7), root cannot write into a directory it
# doesn't own (no CAP_DAC_OVERRIDE to bypass permission checks). openssl
# then fails with "Permission denied" on key.pem.
#
# Fix: chown /app/certs back to root:root before openssl. This is safe
# because we still hold CAP_CHOWN (needed for the final chown below).
# ---------------------------------------------------------------------------
chown root:root /app/certs
chmod 755 /app/certs

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
fi

# ---------------------------------------------------------------------------
# 4. Transfer ownership to app user (UID 1001)
# ---------------------------------------------------------------------------
chown -R 1001:1001 /app/data /app/certs /app/media

# ---------------------------------------------------------------------------
# 5. Drop privileges and run the app
# ---------------------------------------------------------------------------
exec su-exec 1001:1001 "$@"