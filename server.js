// ============================================================================
// server.js — Bootstrap entry point
// ----------------------------------------------------------------------------
// Order of operations is CRITICAL:
//   1. Run migrations (creates tables)
//   2. Seed default data
//   3. Ensure TLS certificates
//   4. Load the Express app (models can now prepare statements)
//   5. Start HTTPS server
// ============================================================================

const fs = require('fs');
const path = require('path');
const https = require('https');

const config = require('./src/config');
const logger = require('./src/utils/logger');
const { runMigrations } = require('./src/database/schema');

// ---------------------------------------------------------------------------
// TLS certificates
// ---------------------------------------------------------------------------
async function ensureCertificates() {
  const { certPath, keyPath, days, commonName, country, state, locality, org } = config.tls;

  const certDir = path.dirname(certPath);
  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return;
  }

  logger.warn('TLS certificates not found — generating self-signed pair');

  const selfsigned = require('selfsigned');

  const attrs = [
    { name: 'CN', value: commonName },
    { name: 'C',  value: country },
    { name: 'ST', value: state },
    { name: 'L',  value: locality },
    { name: 'O',  value: org },
  ];

  const pems = await selfsigned.generate(attrs, {
    days,
    keySize: 2048,
    algorithm: 'sha256',
  });

  if (!pems || !pems.private || !pems.cert) {
    throw new Error('selfsigned.generate returned an unexpected shape');
  }

  fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });
  fs.writeFileSync(certPath, pems.cert, { mode: 0o644 });

  logger.info('Self-signed certificates generated');
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function bootstrap() {
  // 1. Migrations FIRST — before any model is loaded.
  try {
    runMigrations();
  } catch (err) {
    logger.error('Migrations failed — aborting startup', err);
    process.exit(1);
  }

  // 2. Seed default data (idempotent).
  try {
    const { seed } = require('./src/database/seed');
    seed();
  } catch (err) {
    logger.error('Seeding failed (continuing)', err);
  }

  // 3. TLS certificates.
  try {
    await ensureCertificates();
  } catch (err) {
    logger.error('Could not ensure TLS certificates — aborting startup', err);
    process.exit(1);
  }

  // 4. NOW load the app — models prepare statements against a ready schema.
  const app = require('./src/app');

  // 5. HTTPS server with hardened TLS configuration.
  // ---------------------------------------------------------------------------
  // TLS configuration — Mozilla "Intermediate" profile (2024)
  // ---------------------------------------------------------------------------
  // - TLS 1.2 + 1.3 only (TLS 1.0/1.1 disabled)
  // - Cipher suites ordered by preference
  // - X25519 + secp384r1 + secp256r1 (ECDHE curves)
  // - Server cipher preference (prevents BEAST attacks on TLS 1.0)
  // ---------------------------------------------------------------------------
  const httpsOptions = {
    key: fs.readFileSync(config.tls.keyPath),
    cert: fs.readFileSync(config.tls.certPath),

    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',
    honorCipherOrder: true,

    // Mozilla Intermediate cipher suites (TLS 1.2 + 1.3)
    // Node.js uses OpenSSL names, not IANA names.
    ciphers: [
      'TLS_AES_128_GCM_SHA256',           // TLS 1.3
      'TLS_AES_256_GCM_SHA384',           // TLS 1.3
      'TLS_CHACHA20_POLY1305_SHA256',     // TLS 1.3
      'ECDHE-ECDSA-AES128-GCM-SHA256',    // TLS 1.2
      'ECDHE-RSA-AES128-GCM-SHA256',      // TLS 1.2
      'ECDHE-ECDSA-AES256-GCM-SHA384',    // TLS 1.2
      'ECDHE-RSA-AES256-GCM-SHA384',      // TLS 1.2
      'ECDHE-ECDSA-CHACHA20-POLY1305',    // TLS 1.2
      'ECDHE-RSA-CHACHA20-POLY1305',      // TLS 1.2
    ].join(':'),

    // ECDHE curve preference (X25519 first — faster than P-256)
    ecdhCurve: 'X25519:secp384r1:secp256r1',
  };

  const server = https.createServer(httpsOptions, app);

  // Slowloris / DoS defenses
  server.requestTimeout = 10_000;
  server.headersTimeout = 12_000;
  server.keepAliveTimeout = 5_000;
  server.timeout = 15_000;

  server.listen(config.server.port, config.server.host, () => {
    logger.info(
      `HTTPS server running on https://${config.server.host}:${config.server.port} (env=${config.env})`
    );
  });

  // 6. Graceful shutdown.
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal} — shutting down gracefully`);

    server.close((err) => {
      if (err) {
        logger.error('Error during server close', err);
        process.exit(1);
      }
      logger.info('Server closed cleanly');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced exit after 5s shutdown timeout');
      process.exit(1);
    }, 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 7. Last-resort error handlers.
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason);
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception — shutting down', err);
    shutdown('uncaughtException');
  });
}

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------
bootstrap().catch((err) => {
  logger.error('Fatal startup error', err);
  process.exit(1);
});