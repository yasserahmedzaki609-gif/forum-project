// ============================================================================
// src/services/comment.service.js — P25 Transactional operations + P24 Moderation
// ============================================================================

const db = require('../database/db');
const commentModel = require('../models/comment.model');
const reactionModel = require('../models/reaction.model');
const activityModel = require('../models/activity.model');
const notificationModel = require('../models/notification.model');
const { initialCommentStatus } = require('../middleware/moderationMode');

// ---------------------------------------------------------------------------
// P25 + P24: Atomic createComment (comment + activity + notify post owner)
// مع الالتزام بترتيب وسائط commentModel.create: (content, userId, postId, status)
// ---------------------------------------------------------------------------
const createCommentTx = db.transaction(
  (userId, postId, content, postOwnerId) => {
    // P24: moderation-aware initial status
    const status = initialCommentStatus();

    // ترتيب صحيح: (content, userId, postId, status)
    const created = commentModel.create(content, userId, postId, status);
    const commentId = created.id;

    activityModel.log(userId, 'comment_create', 'comment', commentId);

    // إشعار مالك المنشور (إن لم يكن هو نفسه صاحب التعليق)
    if (postOwnerId && postOwnerId !== userId) {
      notificationModel.create(postOwnerId, userId, 'comment', 'post', postId);
    }

    return created; // { id }
  }
);

// ---------------------------------------------------------------------------
// P25: Atomic reactToComment (reaction + notification)
// ---------------------------------------------------------------------------
const reactToCommentTx = db.transaction(
  (userId, commentId, value, commentOwnerId) => {
    const result = reactionModel.react(userId, 'comment', commentId, value);

    if (result.action === 'added' && value === 1 && commentOwnerId !== userId) {
      notificationModel.create(commentOwnerId, userId, 'like', 'comment', commentId);
    }

    return result;
  }
);

// ---------------------------------------------------------------------------
// P25 (extended): Atomic updateComment (content + activity log)
// ---------------------------------------------------------------------------
const updateCommentTx = db.transaction(
  (commentId, userId, content, expectedUpdatedAt) => {
    const ok = commentModel.update(commentId, userId, content, expectedUpdatedAt);
    if (!ok) return false;

    activityModel.log(userId, 'comment_edit', 'comment', commentId);
    return true;
  }
);

module.exports = {
  createComment: createCommentTx,
  reactToComment: reactToCommentTx,
  updateComment: updateCommentTx,
};