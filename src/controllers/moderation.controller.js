// ============================================================================
// src/controllers/moderation.controller.js — F05 & P23 & C1 & D3
// ============================================================================

const userModel = require('../models/user.model');
const postModel = require('../models/post.model');
const commentModel = require('../models/comment.model');
const reportModel = require('../models/report.model');
const categoryModel = require('../models/category.model');
const roleRequestModel = require('../models/roleRequest.model');
const moderationLogModel = require('../models/moderationLog.model'); // ← C1: Audit trail model

const { HttpError } = require('../middleware/errorHandler');
const {
  validateRoleRequest,
  validateRoleRequestReview,
} = require('../validators/moderation.validator');

// ---------------------------------------------------------------------------
// PATCH /api/users/:id/role (Admin only)
// ---------------------------------------------------------------------------
function changeUserRole(req, res, next) {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!Number.isInteger(userId) || userId <= 0) throw new HttpError(400, 'Invalid user id');

    const user = userModel.findById(userId);
    if (!user) throw new HttpError(404, 'User not found');

    if (user.id === req.user.id && req.body.role !== 'admin') {
      throw new HttpError(400, 'You cannot demote yourself');
    }

    const previousRole = user.role;
    userModel.updateRole(userId, req.body.role);

    // C1: audit trail
    moderationLogModel.log(req.user.id, 'user.role_change', 'user', userId, {
      previous_role: previousRole,
      new_role: req.body.role,
    });

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

    const post = postModel.findById(postId);
    if (!post) throw new HttpError(404, 'Post not found');

    const previousStatus = post.status;
    postModel.updateStatus(postId, req.body.status);

    // C1: audit trail
    moderationLogModel.log(req.user.id, 'post.status_change', 'post', postId, {
      previous_status: previousStatus,
      new_status: req.body.status,
    });

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
    if (!Number.isInteger(commentId) || commentId <= 0)
      throw new HttpError(400, 'Invalid comment id');

    const comment = commentModel.findById(commentId);
    if (!comment) throw new HttpError(404, 'Comment not found');

    const previousStatus = comment.status;
    commentModel.updateStatus(commentId, req.body.status);

    // C1: audit trail
    moderationLogModel.log(req.user.id, 'comment.status_change', 'comment', commentId, {
      previous_status: previousStatus,
      new_status: req.body.status,
    });

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

    const report = reportModel.findById(reportId);
    if (!report) throw new HttpError(404, 'Report not found');

    const previousStatus = report.status;
    reportModel.updateStatus(reportId, req.body.status);

    // C1: audit trail
    moderationLogModel.log(req.user.id, 'report.status_change', 'report', reportId, {
      previous_status: previousStatus,
      new_status: req.body.status,
    });

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
    validateRoleRequest(req);
    const { requestedRole, reason } = req.body;

    const existing = roleRequestModel.findPendingByUser(req.user.id);
    if (existing) {
      throw new HttpError(409, 'You already have a pending role request');
    }

    if (req.user.role === requestedRole) {
      throw new HttpError(400, `You are already a ${requestedRole}`);
    }

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
    validateRoleRequestReview(req);

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, 'Invalid request id');
    }

    const { action } = req.body;

    let result;
    if (action === 'approve') {
      result = roleRequestModel.approve(id, req.user.id);
    } else {
      result = roleRequestModel.reject(id, req.user.id);
    }

    if (!result.ok) {
      if (result.reason === 'not_found') {
        throw new HttpError(404, 'Role request not found');
      }
      if (result.reason === 'already_reviewed') {
        throw new HttpError(409, 'Role request already reviewed');
      }
      throw new HttpError(500, 'Failed to review role request');
    }

    // C1: audit trail
    moderationLogModel.log(
      req.user.id,
      `role_request.${action}`,
      'role_request',
      id,
      result.userId ? { user_id: result.userId, new_role: result.role } : {}
    );

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

// ===========================================================================
// C1: Audit Log Management
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /api/moderation/audit-log — admin only
// ---------------------------------------------------------------------------
function listAuditLog(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

    const { target_type, target_id, actor_id } = req.query;

    let rows;
    if (target_type && target_id) {
      rows = moderationLogModel.listByTarget(target_type, parseInt(target_id, 10));
    } else if (actor_id) {
      rows = moderationLogModel.listByActor(parseInt(actor_id, 10), limit);
    } else {
      rows = moderationLogModel.listRecent(limit);
    }

    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// ===========================================================================
// D3: User Management (Admin Only)
// ===========================================================================

// ---------------------------------------------------------------------------
// D3: GET /api/users — admin only, list all users for role management
// ---------------------------------------------------------------------------
function listUsers(req, res, next) {
  try {
    const users = userModel.listAll();

    // Don't leak password hashes. Add a derived "isSsoOnly" flag for the UI.
    // Note: stmtListAll already excludes the password column, but explicit
    // sanitization here is a best practice for defense in depth.
    const sanitized = users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      created_at: u.created_at,
      isSsoOnly: false, // Can be computed later if needed
    }));

    res.json(sanitized);
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
  listAuditLog,
  listUsers,
};
