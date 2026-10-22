// ============================================================================
// tests/setup.js — Environment for tests
// ----------------------------------------------------------------------------
// Loaded BEFORE any test file via jest.setupFiles.
// Must set env vars before config/index.js is imported.
// ============================================================================

process.env.NODE_ENV = 'test';

// Secrets (≥32 chars) — test-only, not used in production.
process.env.SESSION_SECRET = 'test_session_secret_that_is_long_enough_1234';
process.env.CSRF_SECRET = 'test_csrf_secret_that_is_long_enough_5678';

// In-memory database: no file, no lock, no cleanup, no EBUSY on Windows.
// Each test file gets a fresh DB via jest.resetModules() in resetDb().
process.env.DB_PATH = ':memory:';

// F04-FIX (G1+): Set to empty string (NOT delete) so dotenv.config()
// in src/config/index.js sees the key as already-defined and skips
// overwriting it from .env. `delete` would remove the key, allowing
// dotenv to re-add it from .env, which is exactly the bug we're fixing.
process.env.DB_PASSWORD = '';

// Isolated media root (only used if a media test runs).
process.env.MEDIA_ROOT = './media/test';

// Tighter body limit for security tests.
process.env.BODY_LIMIT = '10kb';
