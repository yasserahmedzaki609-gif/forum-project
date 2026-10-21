// ============================================================================
// src/models/roleRequest.model.js — P23 Role Request CRUD
// ----------------------------------------------------------------------------
// Enforces:
//   - one pending request per user (checked at controller level)
//   - atomic review (UPDATE status + UPDATE user role)
//   - audit trail via reviewed_by / reviewed_at
// ============================================================================

const db = require('../database/db');

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------
const stmtCreate = db.prepare(`
  INSERT INTO role_requests (user_id, requested_role, reason)
  VALUES (?, ?, ?)
`);

const stmtFindById = db.prepare('SELECT * FROM role_requests WHERE id = ?');

const stmtFindPendingByUser = db.prepare(`
  SELECT * FROM role_requests
  WHERE user_id = ? AND status = 'pending'
  LIMIT 1
`);

const stmtListPending = db.prepare(`
  SELECT rr.*, u.username AS requester_username
  FROM role_requests rr
  JOIN users u ON u.id = rr.user_id
  WHERE rr.status = 'pending'
  ORDER BY rr.created_at ASC
`);

const stmtListByUser = db.prepare(`
  SELECT rr.*, reviewer.username AS reviewer_username
  FROM role_requests rr
  LEFT JOIN users reviewer ON reviewer.id = rr.reviewed_by
  WHERE rr.user_id = ?
  ORDER BY rr.created_at DESC
`);

const stmtUpdateStatus = db.prepare(`
  UPDATE role_requests
  SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
  WHERE id = ? AND status = 'pending'
`);

const stmtUpdateUserRole = db.prepare('UPDATE users SET role = ? WHERE id = ?');

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
// Approve: mark request as approved AND promote user — atomically.
// If the user was already promoted by an admin manually, this still works
// because the UPDATE is idempotent (same role).
const approveTx = db.transaction((requestId, reviewerId) => {
  const request = stmtFindById.get(requestId);
  if (!request) return { ok: false, reason: 'not_found' };
  if (request.status !== 'pending') return { ok: false, reason: 'already_reviewed' };

  const info = stmtUpdateStatus.run('approved', reviewerId, requestId);
  if (info.changes === 0) return { ok: false, reason: 'update_failed' };

  stmtUpdateUserRole.run(request.requested_role, request.user_id);
  return {
    ok: true,
    userId: request.user_id,
    role: request.requested_role,
  };
});

const rejectTx = db.transaction((requestId, reviewerId) => {
  const info = stmtUpdateStatus.run('rejected', reviewerId, requestId);
  if (info.changes === 0) return { ok: false, reason: 'already_reviewed' };
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
module.exports = {
  create: (userId, requestedRole, reason) => {
    const info = stmtCreate.run(userId, requestedRole, reason);
    return { id: info.lastInsertRowid };
  },
  findById: (id) => stmtFindById.get(id),
  findPendingByUser: (userId) => stmtFindPendingByUser.get(userId),
  listPending: () => stmtListPending.all(),
  listByUser: (userId) => stmtListByUser.all(userId),
  approve: approveTx,
  reject: rejectTx,
};