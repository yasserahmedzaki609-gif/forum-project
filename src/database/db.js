// ============================================================================
// src/database/db.js — SQLite connection (singleton) with optional SQLCipher
// ----------------------------------------------------------------------------
// P21: If config.db.password is set, the database is encrypted with SQLCipher.
// The password MUST be applied with PRAGMA key BEFORE any other operation.
// ============================================================================

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3-multiple-ciphers');

const config = require('../config');
const logger = require('../utils/logger');

const isMemory = config.db.path === ':memory:';

let db;

if (isMemory) {
  db = new Database(':memory:');
  logger.info('Database opened in-memory (:memory:)');
} else {
  const dbDir = path.dirname(config.db.path);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.db.path);
  logger.info(`Database opened at ${config.db.path}`);
}

// --- P21: Apply encryption key (MUST be first) ---
if (config.db.password) {
  if (isMemory) {
    // F04-FIX (G1+ defensive): Belt-and-suspenders check. If config still
    // has a password (e.g., someone ran `node -e "...db.js..."` directly
    // with DB_PASSWORD set), don't crash — SQLCipher can't encrypt :memory:.
    // Log a warning so the mistake is visible but non-fatal.
    logger.warn(
      'DB_PASSWORD is set but database is :memory: — skipping SQLCipher. ' +
        'Tests should force this to empty via config; this branch is a safety net.'
    );
  } else {
    try {
      // F04-FIX (B3): Escape single quotes in the password to prevent PRAGMA
      // injection.
      const safe = String(config.db.password).replace(/'/g, "''");
      db.pragma(`key = '${safe}'`);
      
      // Force a read to verify the key is correct
      db.prepare('SELECT count(*) AS c FROM sqlite_master').get();
      logger.info('Database encryption key applied (SQLCipher)');
    } catch (err) {
      throw new Error(
        'Failed to open encrypted database. ' +
          'Check DB_PASSWORD (or the DB was created without encryption). ' +
          err.message
      );
    }
  }
}

// Foreign keys are OFF by default in SQLite. We need them for CASCADE.
db.pragma('foreign_keys = ON');

// WAL mode (works with SQLCipher too)
if (!isMemory) {
  db.pragma('journal_mode = WAL');
}

module.exports = db;