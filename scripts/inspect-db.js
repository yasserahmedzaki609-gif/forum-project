// ============================================================================
// scripts/inspect-db.js — Print database tables and row counts
// ----------------------------------------------------------------------------
// Usage: npm run db:inspect
// ============================================================================

const db = require('../src/database/db');

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all()
  .map((r) => r.name);

console.log('Tables and row counts:');
console.log('─'.repeat(40));

for (const t of tables) {
  const count = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
  console.log(`  ${t.padEnd(20)} ${count}`);
}

console.log('\nApplied migrations:');
console.log('─'.repeat(40));

const migrations = db
  .prepare('SELECT name, applied_at FROM schema_migrations ORDER BY id')
  .all();

for (const m of migrations) {
  console.log(`  ${m.name.padEnd(25)} ${m.applied_at}`);
}

console.log('');