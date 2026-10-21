// ============================================================================
// src/controllers/moderation.controller.js — F05 & P23
// ============================================================================

const userModel = require('../models/user.model');
const postModel = require('../models/post.model');
const commentModel = require('../models/comment.model');
const reportModel = require('../models/report.model');
const categoryModel = require('../models/category.model');
const roleRequestModel = require('../models/roleRequest.model'); // ← جديد (P23)

const { HttpError } = require('../middleware/errorHandler');
const { 
  validateRoleRequest, 
  validateRoleRequestReview 
} = require('../validators/moderation.validator'); // ← استيراد المحققين

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

// ===========================================================================
// P23: Role Request Workflow
// ===========================================================================

// ---------------------------------------------------------------------------
// POST /api/roles/request — any authenticated user
// ---------------------------------------------------------------------------
function createRoleRequest(req, res, next) {
  try {
    // 1. Validate input strictly
    validateRoleRequest(req);

    const { requestedRole, reason } = req.body;

    // 2. One pending request per user — prevents spam.
    const existing = roleRequestModel.findPendingByUser(req.user.id);
    if (existing) {
      throw new HttpError(409, 'You already have a pending role request');
    }

    // 3. Users cannot request a role they already have.
    if (req.user.role === requestedRole) {
      throw new HttpError(400, `You are already a ${requestedRole}`);
    }

    // 4. Policy: Regular users cannot request 'admin' directly.
    if (requestedRole === 'admin' && req.user.role !== 'moderator') {
      throw new HttpError(403, 'Only moderators can request admin promotion');
    }

    const r = roleRequestModel.create(req.user.id, requestedRole, reason.trim());
    res.status(201).json({ id: r.id, status: 'pending' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/moderation/role-requests — moderators/admin can view queue
// ---------------------------------------------------------------------------
function listRoleRequests(req, res, next) {
  try {
    res.json(roleRequestModel.listPending());
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/moderation/role-requests/:id — admin only
// ---------------------------------------------------------------------------
function reviewRoleRequest(req, res, next) {
  try {
    // 1. Validate input strictly
    validateRoleRequestReview(req);

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, 'Invalid request id');
    }

    const { action } = req.body;

    // 2. Execute review
    let result;
    if (action === 'approve') {
      result = roleRequestModel.approve(id, req.user.id);
    } else {
      result = roleRequestModel.reject(id, req.user.id);
    }

    // 3. Handle business logic errors gracefully
    if (!result.ok) {
      if (result.reason === 'not_found') {
        throw new HttpError(404, 'Role request not found');
      }
      if (result.reason === 'already_reviewed') {
        throw new HttpError(409, 'Role request already reviewed');
      }
      throw new HttpError(500, 'Failed to review role request');
    }

    res.json({
      ok: true,
      action,
      ...(result.userId ? { userId: result.userId, role: result.role } : {}),
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/roles/me — current user's own request history
// ---------------------------------------------------------------------------
function listMyRoleRequests(req, res, next) {
  try {
    res.json(roleRequestModel.listByUser(req.user.id));
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
  createRoleRequest,      
  listRoleRequests,       
  reviewRoleRequest,      
  listMyRoleRequests,     
};