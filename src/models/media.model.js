// ============================================================================
// src/models/media.model.js — Uploaded media CRUD
// ============================================================================

const db = require('../database/db');

const stmtInsert = db.prepare(`
  INSERT INTO media
    (user_id, post_id, kind, original_name, mime_type, size_bytes,
     width, height, storage_path, sha256)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtFindById = db.prepare('SELECT * FROM media WHERE id = ?');
const stmtFindBySha = db.prepare('SELECT * FROM media WHERE sha256 = ?');

const stmtListForPost = db.prepare(`
  SELECT * FROM media
  WHERE post_id = ? AND kind = ?
  ORDER BY created_at ASC
`);

const stmtCountForUser = db.prepare(
  'SELECT COUNT(*) AS c FROM media WHERE user_id = ?'
);

const stmtDelete = db.prepare('DELETE FROM media WHERE id = ?');

module.exports = {
  create: (m) => {
    const info = stmtInsert.run(
      m.userId,
      m.postId || null,
      m.kind,
      m.originalName || null,
      m.mimeType,
      m.sizeBytes,
      m.width,
      m.height,
      m.storagePath,
      m.sha256
    );
    return { id: info.lastInsertRowid, ...m };
  },
  findById: (id) => stmtFindById.get(id),
  findBySha: (sha) => stmtFindBySha.get(sha),
  listForPost: (postId, kind = 'post_image') => stmtListForPost.all(postId, kind),
  countForUser: (userId) => stmtCountForUser.get(userId).c,
  deleteById: (id) => stmtDelete.run(id),
};