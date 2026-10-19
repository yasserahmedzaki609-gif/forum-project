// ============================================================================
// src/controllers/moderation.controller.js — F05
// ============================================================================

const userModel = require('../models/user.model');
const postModel = require('../models/post.model');
const commentModel = require('../models/comment.model');
const reportModel = require('../models/report.model');
const categoryModel = require('../models/category.model');
const { HttpError } = require('../middleware/errorHandler');

// ---------------------------------------------------------------------------
// PATCH /api/users/:id/role (Admin only)
// ---------------------------------------------------------------------------
function changeUserRole(req, res, next) {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!Number.isInteger(userId) || userId <= 0) throw new HttpError(400, 'Invalid user id');

    const user = userModel.findById(userId);
    if (!user) throw new HttpError(404, 'User not found');

    // Admin cannot demote themselves to avoid locking out the only admin
    if (user.id === req.user.id && req.body.role !== 'admin') {
      throw new HttpError(400, 'You cannot demote yourself');
    }

    userModel.updateRole(userId, req.body.role);
    res.json({ ok: true, id: userId, role: req.body.role });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/moderation/queue (Moderator+)
// ---------------------------------------------------------------------------
function listQueue(req, res, next) {
  try {
    res.json({
      posts: postModel.listPending(),
      comments: commentModel.listPending(),
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/moderation/posts/:id/status (Moderator+)
// ---------------------------------------------------------------------------
function changePostStatus(req, res, next) {
  try {
    const postId = parseInt(req.params.id, 10);
    if (!Number.isInteger(postId) || postId <= 0) throw new HttpError(400, 'Invalid post id');

    if (!postModel.findById(postId)) throw new HttpError(404, 'Post not found');

    postModel.updateStatus(postId, req.body.status);
    res.json({ ok: true, id: postId, status: req.body.status });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/moderation/comments/:id/status (Moderator+)
// ---------------------------------------------------------------------------
function changeCommentStatus(req, res, next) {
  try {
    const commentId = parseInt(req.params.id, 10);
    if (!Number.isInteger(commentId) || commentId <= 0) throw new HttpError(400, 'Invalid comment id');

    if (!commentModel.findById(commentId)) throw new HttpError(404, 'Comment not found');

    commentModel.updateStatus(commentId, req.body.status);
    res.json({ ok: true, id: commentId, status: req.body.status });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/reports (Authenticated users)
// ---------------------------------------------------------------------------
function createReport(req, res, next) {
  try {
    const { targetType, targetId, reason } = req.body;

    // Verify target exists
    if (targetType === 'post' && !postModel.findById(targetId)) {
      throw new HttpError(404, 'Post not found');
    }
    if (targetType === 'comment' && !commentModel.findById(targetId)) {
      throw new HttpError(404, 'Comment not found');
    }

    const report = reportModel.create(req.user.id, targetType, targetId, reason.trim());
    res.status(201).json({ id: report.id });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/moderation/reports (Moderator+)
// ---------------------------------------------------------------------------
function listReports(req, res, next) {
  try {
    res.json(reportModel.listOpen());
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/moderation/reports/:id (Moderator+)
// ---------------------------------------------------------------------------
function updateReport(req, res, next) {
  try {
    const reportId = parseInt(req.params.id, 10);
    if (!Number.isInteger(reportId) || reportId <= 0) throw new HttpError(400, 'Invalid report id');

    if (!reportModel.findById(reportId)) throw new HttpError(404, 'Report not found');

    reportModel.updateStatus(reportId, req.body.status);
    res.json({ ok: true, id: reportId, status: req.body.status });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/categories (Admin only)
// ---------------------------------------------------------------------------
function createCategory(req, res, next) {
  try {
    const name = req.body.name.trim();

    if (categoryModel.findByName(name)) {
      throw new HttpError(409, 'Category already exists');
    }

    const cat = categoryModel.create(name);
    res.status(201).json(cat);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  changeUserRole,
  listQueue,
  changePostStatus,
  changeCommentStatus,
  createReport,
  listReports,
  updateReport,
  createCategory,
};