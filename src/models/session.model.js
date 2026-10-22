// ============================================================================
// src/models/session.model.js — F04 hardened + F05 roles JOIN + C5 throttling
// ============================================================================

const db = require('../database/db');
const config = require('../config');
const { v4: uuidv4 } = require('uuid');

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------
// SQLite's CURRENT_TIMESTAMP returns UTC in 'YYYY-MM-DD HH:MM:SS' format.
// JavaScript's Date parses that string as LOCAL time by default — which
// makes sessions on any machine with a non-UTC timezone expire hours early.
//
// parseUtc() normalizes both possible stored formats:
//   1. 'YYYY-MM-DD HH:MM:SS'        (SQLite format, implicit UTC)
//   2. 'YYYY-MM-DDTHH:MM:SS.sssZ'   (ISO 8601 with Z, explicit UTC)
// and returns a Date that always represents the correct UTC instant.
// ---------------------------------------------------------------------------
function toSqliteTimestamp(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function parseUtc(value) {
  if (!value) return null;
  const s = String(value);

  // ISO 8601 (contains 'T') — add Z if missing.
  if (s.includes('T')) {
    return new Date(s.endsWith('Z') ? s : s + 'Z');
  }

  // SQLite format — replace space with T and append Z to force UTC parsing.
  return new Date(s.replace(' ', 'T') + 'Z');
}

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------
const stmtInsert = db.prepare(`
  INSERT INTO sessions (id, user_id, expires_at, last_seen_at, user_agent_hash)
  VALUES (?, ?, ?, ?, ?)
`);

// expires_at is stored in SQLite UTC format via toSqliteTimestamp(); comparing
// it against CURRENT_TIMESTAMP (also SQLite UTC) is a valid string compare
// and can still use idx_sessions_expires.
const stmtFind = db.prepare(`
  SELECT s.id, s.user_id, s.expires_at, s.created_at,
         s.last_seen_at, s.user_agent_hash, u.username, u.role
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.id = ?
    AND s.expires_at > CURRENT_TIMESTAMP
`);

const stmtTouch = db.prepare(`
  UPDATE sessions
  SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = ?
`);

const stmtDelete = db.prepare('DELETE FROM sessions WHERE id = ?');
const stmtDeleteExpired = db.prepare(
  'DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP'
);
const stmtDeleteByUser = db.prepare('DELETE FROM sessions WHERE user_id = ?');

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
function create(userId, ttlMs, uaHash = null) {
  const id = uuidv4();
  const expiresAt = toSqliteTimestamp(new Date(Date.now() + ttlMs));
  const lastSeenAt = new Date().toISOString(); // ISO with Z (explicit UTC)
  stmtInsert.run(id, userId, expiresAt, lastSeenAt, uaHash);
  return { id, userId, expiresAt };
}

function findValid(id, uaHash = null) {
  const row = stmtFind.get(id);
  if (!row) return null;

  const now = Date.now();

  // 1. Absolute timeout — created_at is 'YYYY-MM-DD HH:MM:SS' (UTC).
  const createdAt = parseUtc(row.created_at);
  if (createdAt && now - createdAt.getTime() > config.session.absoluteTimeoutMs) {
    stmtDelete.run(id);
    return null;
  }

  // 2. Idle timeout — last_seen_at is ISO 8601 with Z (UTC).
  const lastSeenAt = parseUtc(row.last_seen_at);
  if (lastSeenAt && now - lastSeenAt.getTime() > config.session.idleTimeoutMs) {
    stmtDelete.run(id);
    return null;
  }

  // 3. UA binding
  if (config.session.bindToUserAgent && row.user_agent_hash) {
    if (row.user_agent_hash !== uaHash) {
      stmtDelete.run(id);
      return null;
    }
  }

  // 4. Touch — but only if last_seen_at is stale enough to matter.
  //
  // FIX (C5): Without throttling, every authenticated request performed an
  // UPDATE on the sessions table. At 100 req/s that's 100 writes/s just for
  // keep-alive, adding unnecessary lock contention to SQLite (WAL helps but
  // doesn't eliminate it) and disk I/O.
  //
  // We only write last_seen_at if it hasn't been updated in the last
  // TOUCH_THROTTLE_MS (5 minutes). This caps DB writes to 1 per session per
  // 5 minutes regardless of request rate. The idle timeout remains accurate
  // within a 5-minute window, which is fine because idle timeout itself is
  // measured in hours.
  const TOUCH_THROTTLE_MS = 5 * 60 * 1000;
  if (!lastSeenAt || now - lastSeenAt.getTime() > TOUCH_THROTTLE_MS) {
    stmtTouch.run(id);
    // Update the returned row so callers see the fresh timestamp
    row.last_seen_at = new Date().toISOString();
  }

  return row;
}

function rotate(oldId, userId, ttlMs, uaHash = null) {
  if (oldId) stmtDelete.run(oldId);
  return create(userId, ttlMs, uaHash);
}

module.exports = {
  create,
  findValid,
  rotate,
  delete: (id) => stmtDelete.run(id),
  deleteExpired: () => stmtDeleteExpired.run(),
  deleteByUser: (userId) => stmtDeleteByUser.run(userId),
  deleteAllForUser: (userId) => stmtDeleteByUser.run(userId),
};