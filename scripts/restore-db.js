// ============================================================================
// scripts/restore-db.js — Restore the SQLCipher database from a backup
// ----------------------------------------------------------------------------
// Usage: npm run db:restore -- ./data/backup-YYYYMMDD.db
//
// Stops existing DB connections, verifies the backup key, then replaces the
// live DB file. Existing WAL/SHM files are removed to avoid corruption.
//
// IMPORTANT: Stop the server BEFORE running this script.
// ============================================================================

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3-multiple-ciphers');

const config = require('../src/config');
const logger = require('../src/utils/logger');

function main() {
  if (!config.db.password) {
    console.error('DB_PASSWORD is not set. Cannot restore an encrypted backup.');
    process.exit(1);
  }

  const backupPath = process.argv[2];
  if (!backupPath) {
    console.error('Usage: npm run db:restore -- <path-to-backup.db>');
    process.exit(1);
  }

  const backupAbs = path.resolve(backupPath);
  const dbPath = path.resolve(config.db.path);

  if (!fs.existsSync(backupAbs)) {
    console.error(`Backup file not found: ${backupAbs}`);
    process.exit(1);
  }

  // Verify backup key by opening and reading
  logger.info(`Verifying backup: ${backupAbs}`);
  const verifyDb = new Database(backupAbs);
  verifyDb.pragma(`key = '${config.db.password}'`);
  try {
    const tables = verifyDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    logger.info(`✅ Backup verified. Tables: ${tables.map((t) => t.name).join(', ')}`);
  } catch (err) {
    console.error('Wrong DB_PASSWORD (cannot read backup):', err.message);
    process.exit(1);
  }
  verifyDb.close();

  // Refuse if the target DB is currently open (best-effort check)
  if (fs.existsSync(dbPath)) {
    try {
      const testDb = new Database(dbPath, { readonly: true });
      testDb.close();
    } catch (_err) {
      console.error('Target DB appears to be in use. Stop the server before restoring.');
      process.exit(1);
    }
  }

  // Copy backup over DB
  fs.copyFileSync(backupAbs, dbPath);

  // Remove WAL/SHM
  for (const suffix of ['-wal', '-shm']) {
    const f = dbPath + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  logger.info(`✅ Restore complete. Target: ${dbPath}`);
}

try {
  main();
} catch (err) {
  console.error('Restore failed:', err);
  process.exit(1);
}