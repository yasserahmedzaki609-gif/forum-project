// ============================================================================
// src/services/post.service.js — P25 Transactional operations + P24 Moderation
// ----------------------------------------------------------------------------
// Wraps post creation + activity log, and reaction + notification, in single
// SQLite transactions. Mirrors comment.service.js.
// ============================================================================

const db = require('../database/db');
const postModel = require('../models/post.model');
const reactionModel = require('../models/reaction.model');
const activityModel = require('../models/activity.model');
const notificationModel = require('../models/notification.model');
const { initialPostStatus } = require('../middleware/moderationMode'); // ← P24: Moderation-aware status

// ---------------------------------------------------------------------------
// P25 + P24: Atomic createPost (post + categories + activity) with
// moderation-aware initial status.
// ---------------------------------------------------------------------------
// Note: postModel.create already wraps its own transaction for the post +
// categories insert. We can't nest better-sqlite3 transactions (it errors),
// so we call postModel.create() as a nested no-op transaction — better-sqlite3
// handles savepoints transparently.
// ---------------------------------------------------------------------------
const createPostTx = db.transaction((userId, title, content, categoryIds) => {
  // P24: If moderation is installed, new posts start as 'pending'. Otherwise
  // they go live immediately.
  const status = initialPostStatus();

  const postId = postModel.create(userId, title, content, categoryIds, status);
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