// ============================================================================
// src/routes/moderation.routes.js — F05 routes
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
} = require('../validators/moderation.validator');
const { validate } = require('../middleware/validate');
const { requireAuth, requireModerator, requireAdmin } = require('../middleware/auth');

// --- Admin: User role management ---
router.patch(
  '/api/users/:id/role',
  requireAuth,
  requireAdmin,
  validate(validateRoleChange),
  moderationCtrl.changeUserRole
);

// --- Moderator: Queue ---
router.get(
  '/api/moderation/queue',
  requireAuth,
  requireModerator,
  moderationCtrl.listQueue
);

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

// --- Reports ---
router.post(
  '/api/reports',
  requireAuth,
  validate(validateReport),
  moderationCtrl.createReport
);

router.get(
  '/api/moderation/reports',
  requireAuth,
  requireModerator,
  moderationCtrl.listReports
);

router.patch(
  '/api/moderation/reports/:id',
  requireAuth,
  requireModerator,
  validate(validateReportStatus),
  moderationCtrl.updateReport
);

// --- Admin: Categories ---
router.post(
  '/api/admin/categories',
  requireAuth,
  requireAdmin,
  validate(validateCreateCategory),
  moderationCtrl.createCategory
);

module.exports = router;