// ============================================================================
// src/routes/moderation.routes.js — F05 & P23 & C1 & D3 routes
// ============================================================================

const express = require('express');
const router = express.Router();

const moderationCtrl = require('../controllers/moderation.controller');
const {
  validateRoleChange,
  validateStatusChange,
  validateReport,
  validateReportStatus,
  validateCreateCategory,
  validateRoleRequest, // ← جديد (P23)
  validateRoleRequestReview, // ← جديد (P23)
} = require('../validators/moderation.validator');

const { validate } = require('../middleware/validate');
const { requireAuth, requireModerator, requireAdmin } = require('../middleware/auth');
const { reportLimiter } = require('../middleware/rateLimit'); // ⬅️ F04-FIX (C2)

// ===========================================================================
// Admin: User role management
// ===========================================================================
router.patch(
  '/api/users/:id/role',
  requireAuth,
  requireAdmin,
  validate(validateRoleChange),
  moderationCtrl.changeUserRole
);

// ===========================================================================
// Moderator: Queue & Status Management
// ===========================================================================
router.get('/api/moderation/queue', requireAuth, requireModerator, moderationCtrl.listQueue);

router.patch(
  '/api/moderation/posts/:id/status',
  requireAuth,
  requireModerator,
  validate(validateStatusChange),
  moderationCtrl.changePostStatus
);

router.patch(
  '/api/moderation/comments/:id/status',
  requireAuth,
  requireModerator,
  validate(validateStatusChange),
  moderationCtrl.changeCommentStatus
);

// ===========================================================================
// Reports (Authenticated users can report, Moderators can manage)
// ===========================================================================
router.post(
  '/api/reports',
  requireAuth,
  reportLimiter, // ← F04-FIX (C2): Prevents flooding the moderation queue
  validate(validateReport),
  moderationCtrl.createReport
);

router.get('/api/moderation/reports', requireAuth, requireModerator, moderationCtrl.listReports);

router.patch(
  '/api/moderation/reports/:id',
  requireAuth,
  requireModerator,
  validate(validateReportStatus),
  moderationCtrl.updateReport
);

// ===========================================================================
// Admin: Categories
// ===========================================================================
router.post(
  '/api/admin/categories',
  requireAuth,
  requireAdmin,
  validate(validateCreateCategory),
  moderationCtrl.createCategory
);

// ===========================================================================
// P23: Role Requests Workflow
// ===========================================================================

// Any authenticated user can submit a role request
router.post(
  '/api/roles/request',
  requireAuth,
  validate(validateRoleRequest),
  moderationCtrl.createRoleRequest
);

// User can view their own request history
router.get('/api/roles/me', requireAuth, moderationCtrl.listMyRoleRequests);

// Moderators can see the pending queue (to be aware of demand)
router.get(
  '/api/moderation/role-requests',
  requireAuth,
  requireModerator,
  moderationCtrl.listRoleRequests
);

// Only admins can review (approve/reject) — moderators cannot promote users
router.patch(
  '/api/moderation/role-requests/:id',
  requireAuth,
  requireAdmin, // ⚠️ Security Note: Strictly Admin. Moderators cannot escalate privileges.
  validate(validateRoleRequestReview),
  moderationCtrl.reviewRoleRequest
);

// ===========================================================================
// C1: Audit Trail (admin only)
// ===========================================================================
router.get('/api/moderation/audit-log', requireAuth, requireAdmin, moderationCtrl.listAuditLog);

// ===========================================================================
// D3: Users list (admin only) for role management UI
// ===========================================================================
router.get('/api/users', requireAuth, requireAdmin, moderationCtrl.listUsers);

module.exports = router;
