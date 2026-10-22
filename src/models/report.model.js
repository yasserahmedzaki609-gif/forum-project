// ============================================================================
// src/models/report.model.js — Moderation reports
// ============================================================================

const db = require('../database/db');

const stmtInsert = db.prepare(`
  INSERT INTO reports (reporter_id, target_type, target_id, reason)
  VALUES (?, ?, ?, ?)
`);

const stmtById = db.prepare('SELECT * FROM reports WHERE id = ?');
const stmtAllOpen = db.prepare(
  "SELECT * FROM reports WHERE status = 'open' ORDER BY created_at ASC"
);
const stmtUpdateStatus = db.prepare('UPDATE reports SET status = ? WHERE id = ?');

module.exports = {
  create: (reporterId, targetType, targetId, reason) => {
    const info = stmtInsert.run(reporterId, targetType, targetId, reason);
    return { id: info.lastInsertRowid };
  },
  findById: (id) => stmtById.get(id),
  listOpen: () => stmtAllOpen.all(),
  updateStatus: (id, status) => {
    const info = stmtUpdateStatus.run(status, id);
    return info.changes > 0;
  },
};
