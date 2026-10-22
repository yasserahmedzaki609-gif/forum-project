// ============================================================================
// generate-certs.js — Local helper to create a self-signed TLS pair
// ----------------------------------------------------------------------------
// NOTE: In Docker, entrypoint.sh handles certificate generation via openssl.
// This script is only for local development when you want explicit control.
//
// selfsigned@5 returns a Promise — the call MUST be awaited.
//
// Usage: node generate-certs.js
// ============================================================================

const fs = require('fs');
const selfsigned = require('selfsigned');

async function main() {
  const attrs = [{ name: 'commonName', value: 'localhost' }];

  const pems = await selfsigned.generate(attrs, {
    days: 365,
    keySize: 2048,
    algorithm: 'sha256',
  });

  if (!pems || !pems.private || !pems.cert) {
    throw new Error('selfsigned returned an unexpected shape');
  }

  fs.writeFileSync('key.pem', pems.private, { mode: 0o600 });
  fs.writeFileSync('cert.pem', pems.cert, { mode: 0o644 });

  console.log('Certificates generated successfully:');
  console.log('  key.pem   (mode 0600)');
  console.log('  cert.pem  (mode 0644)');
}

main().catch((err) => {
  console.error('Failed to generate certificates:', err);
  process.exit(1);
});
