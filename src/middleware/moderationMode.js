// ============================================================================
// src/middleware/moderationMode.js — P24 Conditional Moderation Adapter
// ----------------------------------------------------------------------------
// When a forum installs F05 (moderation) — identified by the presence of the
// `reports` and `role_requests` tables — new user content should require
// approval before it becomes visible. Otherwise posts and comments would be
// auto-approved and moderators would have nothing to moderate.
//
// When F05 is NOT installed (a bare F01-only forum, or the independent
// extensions track), we don't want to force every post through a queue that
// nobody is monitoring. Posts should auto-approve so the forum is usable.
//
// This module isolates that policy decision in one place so no controller
// has to duplicate `tableExists()` checks.
//
// To "install" or "uninstall" moderation on an existing DB:
//   - install:   run migrations 012 + 014 (already done by schema.js)
//   - uninstall: DROP TABLE reports; DROP TABLE role_requests;
// The next server start will pick up the change automatically.
// ============================================================================

const db = require('../database/db');

// ---------------------------------------------------------------------------
// Table existence — cached for the process lifetime (schema doesn't change
// at runtime; if it does, the process is restarted).
// ---------------------------------------------------------------------------
const stmtTableExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?");

const cache = {
  reports: null,
  role_requests: null,
};

function tableExists(name) {
  if (cache[name] !== null) return cache[name];
  const row = stmtTableExists.get(name);
  cache[name] = !!row;
  return cache[name];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @returns {boolean} true if F05 (moderation) is installed.
 *
 * We check TWO tables because either alone would be enough for the intent,
 * but requiring both catches partial installs (e.g. someone ran migration
 * 012 for reports but not 014 for role_requests yet) and returns false
 * until the install is complete.
 */
function isModerationInstalled() {
  return tableExists('reports') && tableExists('role_requests');
}

/**
 * @returns {'pending'|'approved'}
 *
 * If moderation is installed, new posts must wait in the approval queue.
 * Otherwise, they go live immediately.
 */
function initialPostStatus() {
  return isModerationInstalled() ? 'pending' : 'approved';
}

/**
 * Comments follow the same policy as posts, but with one twist: on a
 * moderation-enabled forum, it is common to auto-approve comments (they're
 * replies to an already-approved post, lower signal-to-noise). This is
 * configurable by changing the return below to `initialPostStatus()`.
 */
function initialCommentStatus() {
  return isModerationInstalled() ? 'pending' : 'approved';
}

module.exports = {
  isModerationInstalled,
  initialPostStatus,
  initialCommentStatus,
};
