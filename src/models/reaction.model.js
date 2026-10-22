// ============================================================================
// src/models/reaction.model.js — Unified likes/dislikes
// ----------------------------------------------------------------------------
// One row per (user, target_type, target_id).
// react() semantics:
//   - no existing row  → INSERT
//   - same value       → DELETE (toggle off)
//   - opposite value   → UPDATE (change like ↔ dislike)
// ============================================================================

const db = require('../database/db');

const stmtGet = db.prepare(`
  SELECT id, value FROM reactions
  WHERE user_id = ? AND target_type = ? AND target_id = ?
`);

const stmtInsert = db.prepare(`
  INSERT INTO reactions (user_id, target_type, target_id, value)
  VALUES (?, ?, ?, ?)
`);

const stmtUpdate = db.prepare('UPDATE reactions SET value = ? WHERE id = ?');
const stmtDelete = db.prepare('DELETE FROM reactions WHERE id = ?');

function react(userId, targetType, targetId, value) {
  if (value !== 1 && value !== -1) {
    throw new Error('value must be 1 or -1');
  }

  const existing = stmtGet.get(userId, targetType, targetId);

  if (!existing) {
    stmtInsert.run(userId, targetType, targetId, value);
    return { action: 'added', value };
  }

  if (existing.value === value) {
    stmtDelete.run(existing.id);
    return { action: 'removed', value };
  }

  stmtUpdate.run(value, existing.id);
  return { action: 'changed', value };
}

module.exports = { react };
