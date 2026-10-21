// ============================================================================
// src/models/moderationLog.model.js — C1 Audit Trail
// ----------------------------------------------------------------------------
// Append-only log of every moderation action. Never UPDATE, never DELETE.
// The only writes are INSERTs from moderation.controller.js.
// ============================================================================

const db = require('../database/db');

const stmtInsert = db.prepare(`
  INSERT INTO moderation_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (?, ?, ?, ?, ?)
`);

const stmtListRecent = db.prepare(`
  SELECT ml.*, u.username AS actor_username
  FROM moderation_logs ml
  LEFT JOIN users u ON u.id = ml.actor_id
  ORDER BY ml.created_at DESC
  LIMIT ?
`);

const stmtListByTarget = db.prepare(`
  SELECT ml.*, u.username AS actor_username
  FROM moderation_logs ml
  LEFT JOIN users u ON u.id = ml.actor_id
  WHERE ml.target_type = ? AND ml.target_id = ?
  ORDER BY ml.created_at DESC
`);

const stmtListByActor = db.prepare(`
  SELECT ml.*, u.username AS actor_username
  FROM moderation_logs ml
  LEFT JOIN users u ON u.id = ml.actor_id
  WHERE ml.actor_id = ?
  ORDER BY ml.created_at DESC
  LIMIT ?
`);

module.exports = {
  log: (actorId, action, targetType, targetId, metadata = null) => {
    const info = stmtInsert.run(
      actorId,
      action,
      targetType,
      targetId,
      metadata ? JSON.stringify(metadata) : null
    );
    return { id: info.lastInsertRowid };
  },
  listRecent: (limit = 100) => stmtListRecent.all(limit),
  listByTarget: (targetType, targetId) => stmtListByTarget.all(targetType, targetId),
  listByActor: (actorId, limit = 100) => stmtListByActor.all(actorId, limit),
};