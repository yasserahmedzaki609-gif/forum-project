// ============================================================================
// src/controllers/comments.controller.js — Comments + F06
// ============================================================================

const commentModel = require('../models/comment.model');
const postModel = require('../models/post.model');
const reactionModel = require('../models/reaction.model');
const notificationModel = require('../models/notification.model');
const activityModel = require('../models/activity.model');
const { HttpError } = require('../middleware/errorHandler');

// ---------------------------------------------------------------------------
// GET /api/posts/:postId/comments
// ---------------------------------------------------------------------------
function listComments(req, res, next) {
  try {
    const postId = parseInt(req.params.postId, 10);
    if (!Number.isInteger(postId) || postId <= 0) {
      throw new HttpError(400, 'Invalid post id');
    }
    if (!postModel.findById(postId)) {
      throw new HttpError(404, 'Post not found');
    }
    res.json(commentModel.findByPost(postId));
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/posts/:postId/comments
// ---------------------------------------------------------------------------
function createComment(req, res, next) {
  try {
    const postId = parseInt(req.params.postId, 10);
    if (!Number.isInteger(postId) || postId <= 0) {
      throw new HttpError(400, 'Invalid post id');
    }

    const post = postModel.findById(postId);
    if (!post) throw new HttpError(404, 'Post not found');

    const { content } = req.body;
    const c = commentModel.create(content.trim(), req.user.id, postId);

    // F06: Log activity
    activityModel.log(req.user.id, 'comment_create', 'comment', c.id);

    // F06: Notify post owner
    if (post.user_id !== req.user.id) {
      notificationModel.create(post.user_id, req.user.id, 'comment', 'post', postId);
    }

    res.status(201).json({ id: c.id });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PUT /api/comments/:commentId — F06 Edit (with optimistic locking)
// ---------------------------------------------------------------------------
function updateComment(req, res, next) {
  try {
    const commentId = parseInt(req.params.commentId, 10);
    if (!Number.isInteger(commentId) || commentId <= 0) {
      throw new HttpError(400, 'Invalid comment id');
    }

    const comment = commentModel.findById(commentId);
    if (!comment) throw new HttpError(404, 'Comment not found');
    if (comment.user_id !== req.user.id) {
      throw new HttpError(403, 'You can only edit your own comments');
    }

    const { content, updatedAt } = req.body;

    const ok = commentModel.update(commentId, req.user.id, content.trim(), updatedAt);
    if (!ok) {
      throw new HttpError(409, 'Comment was modified by someone else. Please reload.');
    }

    // F06: Log activity
    activityModel.log(req.user.id, 'comment_edit', 'comment', commentId);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/comments/:commentId — F06 Delete
// ---------------------------------------------------------------------------
function deleteComment(req, res, next) {
  try {
    const commentId = parseInt(req.params.commentId, 10);
    if (!Number.isInteger(commentId) || commentId <= 0) {
      throw new HttpError(400, 'Invalid comment id');
    }

    const comment = commentModel.findById(commentId);
    if (!comment) throw new HttpError(404, 'Comment not found');
    if (comment.user_id !== req.user.id && req.user.role !== 'admin') {
      throw new HttpError(403, 'You can only delete your own comments');
    }

    const ok = commentModel.delete(commentId, comment.user_id);
    if (!ok) throw new HttpError(500, 'Failed to delete comment');

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/comments/:commentId/like | /dislike
// ---------------------------------------------------------------------------
function reactToComment(req, res, next) {
  try {
    const commentId = parseInt(req.params.commentId, 10);
    if (!Number.isInteger(commentId) || commentId <= 0) {
      throw new HttpError(400, 'Invalid comment id');
    }

    const comment = commentModel.findById(commentId);
    if (!comment) throw new HttpError(404, 'Comment not found');

    const value = req.reactionValue;
    if (value !== 1 && value !== -1) {
      throw new HttpError(400, 'Invalid reaction action');
    }

    const result = reactionModel.react(req.user.id, 'comment', commentId, value);

    // F06: Notify comment owner on like
    if (result.action === 'added' && value === 1 && comment.user_id !== req.user.id) {
      notificationModel.create(comment.user_id, req.user.id, 'like', 'comment', commentId);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { listComments, createComment, updateComment, deleteComment, reactToComment };