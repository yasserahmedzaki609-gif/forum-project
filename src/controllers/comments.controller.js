// ============================================================================
// src/controllers/comments.controller.js — Comments + F06 + P25
// ============================================================================

const commentModel = require('../models/comment.model');
const postModel = require('../models/post.model');
const commentService = require('../services/comment.service'); // ← P25 Service Layer
const { HttpError } = require('../middleware/errorHandler');

// ملاحظة: تم إزالة reactionModel, notificationModel, و activityModel 
// لأن منطقها انتقل الآن إلى داخل commentService لضمان الذرية (Atomicity)،
// مما يمنع تحذيرات ESLint حول المتغيرات غير المستخدمة.

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
// POST /api/posts/:postId/comments — P25: atomic (comment + activity + notify)
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

    // P25-FIX: All three operations run in one transaction via Service Layer.
    const c = commentService.createComment(
      req.user.id,
      postId,
      content.trim(),
      post.user_id
    );

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

    // ملاحظة: تسجيل النشاط (Activity Log) يمكن نقله أيضاً للخدمة لاحقاً إذا لزم الأمر،
    // لكن إبقاؤه هنا مقبول طالما أنه عملية قراءة/كتابة منفصلة لا تؤثر على سلامة التعليق نفسه.
    const activityModel = require('../models/activity.model'); // Local require if strictly needed here, or move to service
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
// POST /api/comments/:commentId/like | /dislike — P25: atomic (reaction + notify)
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

    // P25-FIX: Reaction + optional notification in one transaction via Service Layer.
    const result = commentService.reactToComment(
      req.user.id,
      commentId,
      value,
      comment.user_id
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { 
  listComments, 
  createComment, 
  updateComment, 
  deleteComment, 
  reactToComment 
};