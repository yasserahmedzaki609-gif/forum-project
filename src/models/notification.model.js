// ============================================================================
// src/models/notification.model.js — F06 Notifications
// ============================================================================

const db = require('../database/db');

const stmtInsert = db.prepare(`
  INSERT INTO notifications (user_id, actor_id, type, target_type, target_id)
  VALUES (?, ?, ?, ?, ?)
`);
const stmtList = db.prepare(`
  SELECT n.id, n.type, n.target_type, n.target_id, n.is_read, n.created_at, u.username AS actor_name
  FROM notifications n JOIN users u ON u.id = n.actor_id
  WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50
`);
const stmtMarkRead = db.prepare(`
  UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?
`);

module.exports = {
  create: (userId, actorId, type, targetType, targetId) => {
    if (userId === actorId) return null; // Don't notify yourself
    const info = stmtInsert.run(userId, actorId, type, targetType, targetId);
    return { id: info.lastInsertRowid };
  },
  listForUser: (userId) => stmtList.all(userId),
  markRead: (id, userId) => stmtMarkRead.run(id, userId).changes > 0,
};