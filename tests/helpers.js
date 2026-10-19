// ============================================================================
// tests/helpers.js — Shared test utilities
// ----------------------------------------------------------------------------
//   resetDb()      — fresh in-memory DB for this test file
//   getCsrfFor()   — fetch a CSRF token + cookies via a safe GET
//   request        — re-export supertest
// ============================================================================

const request = require('supertest');

// ---------------------------------------------------------------------------
// resetDb — fresh in-memory DB for this test file
// ---------------------------------------------------------------------------
// jest.resetModules() clears Jest's module registry (Node's require.cache
// is NOT enough). The next require() re-executes every module, so db.js
// opens a brand-new :memory: database. Migrations and seed run immediately
// after, so the test file starts with a clean, seeded schema.
// ---------------------------------------------------------------------------
async function resetDb() {
  // Ensure memory mode + isolated media root.
  process.env.DB_PATH = ':memory:';
  process.env.MEDIA_ROOT = './media/test';

  // Clear Jest's module registry so the next require() starts fresh.
  jest.resetModules();

  // Re-require the freshly reset schema and seed modules.
  const { runMigrations } = require('../src/database/schema');
  runMigrations();

  const { seed } = require('../src/database/seed');
  seed();
}

// ---------------------------------------------------------------------------
// getCsrfFor — obtain a CSRF token + cookie string from a safe GET
// ---------------------------------------------------------------------------
async function getCsrfFor(agentOrApp) {
  const res = await agentOrApp.get('/auth/providers');

  const setCookie = res.headers['set-cookie'] || [];
  const csrfCookie = setCookie.find((c) => c.startsWith('csrf_token='));
  const sessionCookie = setCookie.find((c) => c.startsWith('forum_session='));

  const cookies = [csrfCookie, sessionCookie]
    .filter(Boolean)
    .map((c) => c.split(';')[0])
    .join('; ');

  const token = csrfCookie ? csrfCookie.split(';')[0].split('=')[1] : null;

  return { token, cookies };
}

module.exports = { resetDb, getCsrfFor, request };