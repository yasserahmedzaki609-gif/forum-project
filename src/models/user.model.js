// ============================================================================
// src/models/user.model.js — User CRUD (F05: with roles) + C4
// ============================================================================

const db = require('../database/db');

const stmtFindByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const stmtFindByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const stmtFindById = db.prepare(
  'SELECT id, username, email, role, created_at FROM users WHERE id = ?'
);
const stmtFindByIdWithPassword = db.prepare('SELECT * FROM users WHERE id = ?');
const stmtInsert = db.prepare(
  'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)'
);
const stmtUpdatePassword = db.prepare('UPDATE users SET password = ? WHERE id = ?');
const stmtUpdateRole = db.prepare('UPDATE users SET role = ? WHERE id = ?');

// C4: Delete user — cascades handle related rows (sessions, posts, comments,
// reactions, media, identities, reports). moderation_logs.actor_id becomes
// NULL (preserved for audit), role_requests.reviewed_by becomes NULL.
const stmtDeleteById = db.prepare('DELETE FROM users WHERE id = ?');

const stmtCountAll = db.prepare('SELECT COUNT(*) AS c FROM users');

// D3: List all users for admin role management
const stmtListAll = db.prepare(`
  SELECT id, username, email, role, created_at
  FROM users
  ORDER BY created_at ASC
`);

module.exports = {
  findByEmail: (email) => stmtFindByEmail.get(email),
  findByUsername: (username) => stmtFindByUsername.get(username),
  findById: (id) => stmtFindById.get(id),
  findByIdWithPassword: (id) => stmtFindByIdWithPassword.get(id),
  countAll: () => stmtCountAll.get().c,
  deleteById: (id) => stmtDeleteById.run(id).changes > 0, // ← C4: جديد
  listAll: () => stmtListAll.all(), // ← D3: موجود مسبقاً
  create: (username, email, passwordHash, role = 'user') => {
    const info = stmtInsert.run(username, email, passwordHash, role);
    return { id: info.lastInsertRowid, username, email, role };
  },
  updatePassword: (id, newHash) => {
    const info = stmtUpdatePassword.run(newHash, id);
    return info.changes > 0;
  },
  updateRole: (id, role) => {
    const info = stmtUpdateRole.run(role, id);
    return info.changes > 0;
  },
};
