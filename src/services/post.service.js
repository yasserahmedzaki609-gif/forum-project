// ============================================================================
// src/services/post.service.js — P25 Transactional post operations
// ----------------------------------------------------------------------------
// Wraps post creation + activity log, and reaction + notification, in single
// SQLite transactions. Mirrors comment.service.js.
// ============================================================================

const db = require('../database/db');
const postModel = require('../models/post.model');
const reactionModel = require('../models/reaction.model');
const activityModel = require('../models/activity.model');
const notificationModel = require('../models/notification.model');

// ---------------------------------------------------------------------------
// P25: Atomic createPost (post + categories + activity log)
// ---------------------------------------------------------------------------
// Note: postModel.create already wraps its own transaction for the post +
// categories insert. We can't nest better-sqlite3 transactions (it errors),
// so we call postModel.create() as a nested no-op transaction — better-sqlite3
// handles savepoints transparently.
// ---------------------------------------------------------------------------
const createPostTx = db.transaction((userId, title, content, categoryIds) => {
  const postId = postModel.create(userId, title, content, categoryIds);
  activityModel.log(userId, 'post_create', 'post', postId);
  return postId;
});

// ---------------------------------------------------------------------------
// P25: Atomic reactToPost (like/dislike + notification)
// ---------------------------------------------------------------------------
const reactToPostTx = db.transaction((userId, postId, value, postOwnerId) => {
  const result = reactionModel.react(userId, 'post', postId, value);

  if (result.action === 'added' && value === 1 && postOwnerId !== userId) {
    notificationModel.create(postOwnerId, userId, 'like', 'post', postId);
  }

  return result;
});

module.exports = {
  createPost: createPostTx,
  reactToPost: reactToPostTx,
};