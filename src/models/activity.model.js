// ============================================================================
// src/models/activity.model.js — F06 Activity Logs
// ============================================================================

const db = require('../database/db');

const stmtInsert = db.prepare(`
  INSERT INTO activity_logs (user_id, action, target_type, target_id)
  VALUES (?, ?, ?, ?)
`);
const stmtList = db.prepare(`
  SELECT id, action, target_type, target_id, created_at
  FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
`);

module.exports = {
  log: (userId, action, targetType, targetId) => {
    const info = stmtInsert.run(userId, action, targetType, targetId);
    return { id: info.lastInsertRowid };
  },
  listForUser: (userId) => stmtList.all(userId),
};
