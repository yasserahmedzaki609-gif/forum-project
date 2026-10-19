const db = require('../database/db');

const stmtInsert = db.prepare(
  'INSERT INTO comments (content, user_id, post_id, status, updated_at) VALUES (?, ?, ?, ?, strftime(\'%Y-%m-%d %H:%M:%f\', \'now\'))'
);

const stmtByPost = db.prepare(`
  SELECT c.id, c.content, c.created_at, c.updated_at, c.status, c.user_id, u.username AS author,
    COALESCE(SUM(CASE WHEN r.value = 1  THEN 1 ELSE 0 END), 0) AS likes_count,
    COALESCE(SUM(CASE WHEN r.value = -1 THEN 1 ELSE 0 END), 0) AS dislikes_count
  FROM comments c JOIN users u ON u.id = c.user_id
  LEFT JOIN reactions r ON r.target_type = 'comment' AND r.target_id = c.id
  WHERE c.post_id = ? AND c.status = 'approved'
  GROUP BY c.id ORDER BY c.created_at ASC
`);

const stmtById = db.prepare('SELECT * FROM comments WHERE id = ?');
const stmtUpdateStatus = db.prepare('UPDATE comments SET status = ? WHERE id = ?');

const stmtUpdateContent = db.prepare(`
  UPDATE comments 
  SET content = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now')
  WHERE id = ? AND user_id = ? AND updated_at = ?
`);

const stmtDelete = db.prepare('DELETE FROM comments WHERE id = ? AND user_id = ?');

function listPending() {
  return db.prepare(`
    SELECT c.id, c.content, c.created_at, c.status, u.username AS author, p.title AS post_title, c.post_id
    FROM comments c JOIN users u ON u.id = c.user_id JOIN posts p ON p.id = c.post_id
    WHERE c.status = 'pending' ORDER BY c.created_at ASC
  `).all();
}

module.exports = {
  findByPost: (postId) => stmtByPost.all(postId),
  findById: (id) => stmtById.get(id),
  create: (content, userId, postId, status = 'approved') => {
    const info = stmtInsert.run(content, userId, postId, status);
    return { id: info.lastInsertRowid };
  },
  updateStatus: (id, status) => stmtUpdateStatus.run(status, id).changes > 0,
  update: (commentId, userId, content, expectedUpdatedAt) => {
    const info = stmtUpdateContent.run(content, commentId, userId, expectedUpdatedAt);
    return info.changes > 0;
  },
  delete: (commentId, userId) => {
    const info = stmtDelete.run(commentId, userId);
    return info.changes > 0;
  },
  listPending,
};