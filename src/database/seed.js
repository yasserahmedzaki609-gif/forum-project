// ============================================================================
// src/database/seed.js — Default data seeding (idempotent)
// ----------------------------------------------------------------------------
// Inserts default categories. Safe to run on every boot:
// INSERT OR IGNORE skips rows that already exist (UNIQUE constraint on name).
//
// Can be run as a script: `npm run db:seed`
// Or imported: `const { seed } = require('./seed'); seed();`
// ============================================================================

const db = require('./db');
const { runMigrations } = require('./schema');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Default categories
// ---------------------------------------------------------------------------
// These are the "subforums" that ship with a fresh install.
// Admins can add more later; these are just to make the forum usable
// immediately after installation.
// ---------------------------------------------------------------------------
const DEFAULT_CATEGORIES = ['General', 'Technology', 'Sports', 'Science'];

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------
function seed() {
  // Ensure the schema is up to date before inserting.
  runMigrations();

  const stmt = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');

  const tx = db.transaction((names) => {
    for (const n of names) stmt.run(n);
  });

  tx(DEFAULT_CATEGORIES);

  logger.info(`Seeded ${DEFAULT_CATEGORIES.length} categories`);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
// When run directly (`node src/database/seed.js`), execute and exit.
// When required as a module, expose the function only.
// ---------------------------------------------------------------------------
if (require.main === module) {
  try {
    seed();

    console.log('Seed complete.');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

module.exports = { seed };
