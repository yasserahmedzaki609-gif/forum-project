// ============================================================================
// scripts/backup-db.js — Create an encrypted backup of the SQLCipher database
// ----------------------------------------------------------------------------
// Usage: npm run db:backup [-- ./data/backup-YYYYMMDD.db]
//
// The backup is encrypted with the SAME password as the live DB (DB_PASSWORD).
// Use `sqlcipher_export()` to produce a portable copy.
// ============================================================================

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3-multiple-ciphers');

const config = require('../src/config');
const logger = require('../src/utils/logger');

function main() {
  if (!config.db.password) {
    console.error('DB_PASSWORD is not set. Cannot create an encrypted backup.');
    process.exit(1);
  }

  if (config.db.path === ':memory:') {
    console.error('Cannot back up an in-memory database.');
    process.exit(1);
  }

  const dbPath = path.resolve(config.db.path);
  const backupPath = path.resolve(process.argv[2] || `./data/backup-${Date.now()}.db`);

  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found: ${dbPath}`);
    process.exit(1);
  }

  // Make sure the backup directory exists
  const backupDir = path.dirname(backupPath);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Remove any stale backup
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  // Open the source DB with the correct key
  const db = new Database(dbPath);
  db.pragma(`key = '${config.db.password}'`);

  // Verify key by reading
  try {
    db.prepare('SELECT count(*) AS c FROM sqlite_master').get();
  } catch (err) {
    console.error('Wrong DB_PASSWORD (cannot read DB):', err.message);
    process.exit(1);
  }

  // Export to backup file (encrypted with the same password)
  db.exec(`ATTACH DATABASE '${backupPath}' AS backup KEY '${config.db.password}'`);
  db.exec("SELECT sqlcipher_export('backup')");
  db.exec('DETACH DATABASE backup');
  db.close();

  const stats = fs.statSync(backupPath);
  logger.info(`✅ Backup created: ${backupPath} (${stats.size} bytes)`);

  // Also copy a plaintext manifest for reference
  const manifestPath = backupPath + '.manifest.json';
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        created_at: new Date().toISOString(),
        source_db: dbPath,
        source_size: fs.statSync(dbPath).size,
        backup_size: stats.size,
        encrypted: true,
      },
      null,
      2
    )
  );
  logger.info(`   Manifest: ${manifestPath}`);
}

try {
  main();
} catch (err) {
  console.error('Backup failed:', err);
  process.exit(1);
}
