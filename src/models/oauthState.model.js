// ============================================================================
// src/models/oauthState.model.js — Single-use OAuth state store
// ----------------------------------------------------------------------------
// Stores state, PKCE verifier, and nonce server-side.
// consume() is atomic (transaction: SELECT + DELETE) and single-use.
//
// expires_at format: SQLite 'YYYY-MM-DD HH:MM:SS' (UTC) — same as
// CURRENT_TIMESTAMP. All comparisons wrap both sides in datetime() so that
// any legacy rows written in ISO 8601 ('2026-01-01T12:10:00.000Z') are still
// evaluated correctly instead of being treated as "never expires".
// ============================================================================

const db = require('../database/db');
const config = require('../config');

// ---------------------------------------------------------------------------
// Timestamp helper — ISO → SQLite format (UTC)
// ---------------------------------------------------------------------------
function toSqliteTimestamp(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------
const stmtInsert = db.prepare(`
  INSERT INTO oauth_states
    (state, code_verifier, nonce, provider, redirect_to, link_user_id, expires_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

// datetime() normalizes both sides so legacy ISO rows and SQLite-format rows
// are compared on equal footing. Without it, a text comparison between
// '2026-01-01T...' and '2026-01-01 ...' would ALWAYS be true (T > space).
const stmtTake = db.prepare(`
  SELECT * FROM oauth_states
  WHERE state = ? AND datetime(expires_at) > datetime('now')
`);

const stmtDelete = db.prepare('DELETE FROM oauth_states WHERE state = ?');

const stmtCleanup = db.prepare(`
  DELETE FROM oauth_states WHERE datetime(expires_at) <= datetime('now')
`);

// Atomic single-use: read + delete inside a transaction.
const consumeTx = db.transaction((state) => {
  const row = stmtTake.get(state);
  if (!row) return null;
  stmtDelete.run(state);
  return row;
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
module.exports = {
  create: ({ state, codeVerifier, nonce, provider, redirectTo, linkUserId }) => {
    const expiresAt = toSqliteTimestamp(
      new Date(Date.now() + config.sso.stateTtlMs)
    );
    stmtInsert.run(
      state,
      codeVerifier,
      nonce,
      provider,
      redirectTo || null,
      linkUserId || null,
      expiresAt
    );
  },
  consume: (state) => consumeTx(state),
  cleanupExpired: () => stmtCleanup.run(),
};