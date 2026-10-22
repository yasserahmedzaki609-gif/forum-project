// ============================================================================
// src/models/identity.model.js — Identity data access (with unlink support)
// ----------------------------------------------------------------------------
// Core writes go through src/auth/identity.service.js (which enforces policy).
// This model provides safe, parameterized access for reading and unlinking.
// ============================================================================

const db = require('../database/db');

const stmtByUser = db.prepare(`
  SELECT provider, provider_user_id, email, display_name, avatar_url, created_at
  FROM identities
  WHERE user_id = ?
  ORDER BY created_at ASC
`);

const stmtCountByUser = db.prepare('SELECT COUNT(*) AS c FROM identities WHERE user_id = ?');

const stmtDelete = db.prepare('DELETE FROM identities WHERE user_id = ? AND provider = ?');

module.exports = {
  listForUser: (userId) => stmtByUser.all(userId),
  countForUser: (userId) => stmtCountByUser.get(userId).c,

  // Safely unlink a specific provider for a user. Returns true if a row was actually deleted.
  deleteByUserAndProvider: (userId, provider) => {
    const info = stmtDelete.run(userId, provider);
    return info.changes > 0;
  },
};
