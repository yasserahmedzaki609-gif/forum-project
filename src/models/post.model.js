// ============================================================================
// src/models/post.model.js — Posts with filters, aggregates, moderation, F06
// ============================================================================

const db = require('../database/db');
const config = require('../config');

const stmtInsert = db.prepare(
  "INSERT INTO posts (title, content, user_id, status, updated_at) VALUES (?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))"
);

const stmtAttachCategory = db.prepare(
  'INSERT OR IGNORE INTO post_categories (post_id, category_id) VALUES (?, ?)'
);

const stmtById = db.prepare('SELECT * FROM posts WHERE id = ?');

const stmtFindByIdAggregated = db.prepare(`
  SELECT
    p.id, p.title, p.content, p.created_at, p.updated_at, p.user_id, p.status,
    u.username AS author,
    GROUP_CONCAT(DISTINCT c.name) AS categories,
    COALESCE(SUM(CASE WHEN r.value = 1 THEN 1 ELSE 0 END), 0) AS likes_count,
    COALESCE(SUM(CASE WHEN r.value = -1 THEN 1 ELSE 0 END), 0) AS dislikes_count,
    (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id AND cm.status = 'approved') AS comments_count
  FROM posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN post_categories pc ON pc.post_id = p.id
  LEFT JOIN categories c ON c.id = pc.category_id
  LEFT JOIN reactions r ON r.target_type = 'post' AND r.target_id = p.id
  WHERE p.id = ?
  GROUP BY p.id
`);

const stmtUpdateStatus = db.prepare('UPDATE posts SET status = ? WHERE id = ?');

const stmtUpdateContent = db.prepare(`
  UPDATE posts 
  SET title = ?, content = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now')
  WHERE id = ? AND user_id = ? AND updated_at = ?
`);

const stmtDelete = db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?');
const stmtDeleteCategories = db.prepare('DELETE FROM post_categories WHERE post_id = ?');

function buildListQuery({ category, filter, userId, includePending, limit, offset }) {
  const conditions = [];
  const params = [];

  if (!includePending) conditions.push("p.status = 'approved'");

  const base = `
    SELECT
      p.id, p.title, p.content, p.created_at, p.updated_at, p.user_id, p.status,
      u.username AS author,
      GROUP_CONCAT(DISTINCT c.name) AS categories,
      COALESCE(SUM(CASE WHEN r.value = 1 THEN 1 ELSE 0 END), 0) AS likes_count,
      COALESCE(SUM(CASE WHEN r.value = -1 THEN 1 ELSE 0 END), 0) AS dislikes_count,
      (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id AND cm.status = 'approved') AS comments_count
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN post_categories pc ON pc.post_id = p.id
    LEFT JOIN categories c ON c.id = pc.category_id
    LEFT JOIN reactions r ON r.target_type = 'post' AND r.target_id = p.id
  `;

  if (category) {
    conditions.push(
      `p.id IN (SELECT pc2.post_id FROM post_categories pc2 JOIN categories c2 ON c2.id = pc2.category_id WHERE c2.name = ?)`
    );
    params.push(category);
  }
  if (filter === 'my_posts') {
    if (!userId) throw new Error('UNAUTHORIZED');
    conditions.push('p.user_id = ?');
    params.push(userId);
  } else if (filter === 'my_likes') {
    if (!userId) throw new Error('UNAUTHORIZED');
    conditions.push(
      `p.id IN (SELECT target_id FROM reactions WHERE target_type = 'post' AND value = 1 AND user_id = ?)`
    );
    params.push(userId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `${base} ${where} GROUP BY p.id ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const countQuery = `SELECT COUNT(DISTINCT p.id) AS total FROM posts p ${where}`;
  const countParams = params.slice(0, params.length - 2);

  return { query, params, countQuery, countParams };
}

function list(opts) {
  const limit = Math.min(opts.limit || config.pagination.defaultSize, config.pagination.maxSize);
  const offset = opts.offset || 0;
  const { query, params, countQuery, countParams } = buildListQuery({
    category: opts.category,
    filter: opts.filter,
    userId: opts.userId,
    includePending: opts.includePending || false,
    limit,
    offset,
  });
  const rows = db.prepare(query).all(...params);
  const total = db.prepare(countQuery).get(...countParams).total;
  return { rows, total, limit, offset };
}

const createTx = db.transaction((userId, title, content, categoryIds, status) => {
  const info = stmtInsert.run(title, content, userId, status);
  const postId = info.lastInsertRowid;
  for (const cid of categoryIds) stmtAttachCategory.run(postId, cid);
  return postId;
});

const updateTx = db.transaction(
  (postId, userId, title, content, categoryIds, expectedUpdatedAt) => {
    const info = stmtUpdateContent.run(title, content, postId, userId, expectedUpdatedAt);
    if (info.changes === 0) return false;

    stmtDeleteCategories.run(postId);
    for (const cid of categoryIds) stmtAttachCategory.run(postId, cid);
    return true;
  }
);

const deleteTx = db.transaction((postId, userId) => {
  const info = stmtDelete.run(postId, userId);
  return info.changes > 0;
});

function listPending() {
  return db
    .prepare(
      `
    SELECT p.id, p.title, p.content, p.created_at, p.status, u.username AS author
    FROM posts p JOIN users u ON u.id = p.user_id
    WHERE p.status = 'pending' ORDER BY p.created_at ASC
  `
    )
    .all();
}

module.exports = {
  findById: (id) => stmtById.get(id),
  findByIdAggregated: (id) => stmtFindByIdAggregated.get(id),
  list,
  create: (userId, title, content, categoryIds, status = 'approved') =>
    createTx(userId, title, content, categoryIds, status),
  updateStatus: (id, status) => stmtUpdateStatus.run(status, id).changes > 0,
  update: (postId, userId, title, content, categoryIds, expectedUpdatedAt) =>
    updateTx(postId, userId, title, content, categoryIds, expectedUpdatedAt),
  delete: (postId, userId) => deleteTx(postId, userId),
  listPending,
};
