// ============================================================================
// src/services/comment.service.js — P25 Transactional comment operations + P24
// ----------------------------------------------------------------------------
// Wraps comment creation + activity log + notification in a single SQLite
// transaction. If any step fails (e.g. notification insert), the whole
// operation rolls back — no partial state.
//
// Why a service and not a controller-level transaction?
//   - Controllers stay thin (HTTP in → service call → HTTP out)
//   - Reusable from CLI scripts, seeds, background jobs
//   - Easier to unit-test with a mocked model
// ============================================================================

const db = require('../database/db');
const commentModel = require('../models/comment.model');
const reactionModel = require('../models/reaction.model');
const activityModel = require('../models/activity.model');
const notificationModel = require('../models/notification.model');
const { initialCommentStatus } = require('../middleware/moderationMode'); // ← P24: Moderation-aware status

// ---------------------------------------------------------------------------
// P25 + P24: Atomic createComment with moderation-aware initial status
// ---------------------------------------------------------------------------
const createCommentTx = db.transaction((userId, postId, content, postOwnerId) => {
  // P24: Moderation-aware initial status for comments.
  const status = initialCommentStatus();

  // 1. Insert comment (commentModel.create accepts status as 4th parameter, default 'approved')
  const c = commentModel.create(content, userId, postId, status);

  // 2. Log activity
  activityModel.log(userId, 'comment_create', 'comment', c.id);

  // 3. Notify post owner (only if not self)
  if (postOwnerId !== userId) {
    notificationModel.create(postOwnerId, userId, 'comment', 'post', postId);
  }

  return c;
});

// ---------------------------------------------------------------------------
// P25: Atomic reactToComment (like/dislike + notification)
// ---------------------------------------------------------------------------
const reactToCommentTx = db.transaction((userId, commentId, value, commentOwnerId) => {
  const result = reactionModel.react(userId, 'comment', commentId, value);

  // Only notify on new like (not on unlike, not on self-like)
  if (result.action === 'added' && value === 1 && commentOwnerId !== userId) {
    notificationModel.create(commentOwnerId, userId, 'like', 'comment', commentId);
  }

  return result;
});

module.exports = {
  createComment: createCommentTx,
  reactToComment: reactToCommentTx,
};
