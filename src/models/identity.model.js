// ============================================================================
// src/models/identity.model.js — Read-only access to identities
// ----------------------------------------------------------------------------
// Writes go through src/auth/identity.service.js (which enforces policy).
// ============================================================================

const db = require('../database/db');

const stmtByUser = db.prepare(`
  SELECT provider, provider_user_id, email, display_name, avatar_url, created_at
  FROM identities
  WHERE user_id = ?
  ORDER BY created_at ASC
`);

const stmtCountByUser = db.prepare(
  'SELECT COUNT(*) AS c FROM identities WHERE user_id = ?'
);

module.exports = {
  listForUser: (userId) => stmtByUser.all(userId),
  countForUser: (userId) => stmtCountByUser.get(userId).c,
};