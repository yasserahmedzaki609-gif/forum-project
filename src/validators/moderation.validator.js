// ============================================================================
// src/validators/moderation.validator.js — Moderation inputs
// ============================================================================

const { HttpError } = require('../middleware/errorHandler');

const VALID_ROLES = ['user', 'moderator', 'admin'];
const VALID_STATUSES = ['approved', 'pending', 'rejected'];

function validateRoleChange(req) {
  const { role } = req.body || {};
  if (!role || !VALID_ROLES.includes(role)) {
    throw new HttpError(400, 'Role must be one of: user, moderator, admin');
  }
}

function validateStatusChange(req) {
  const { status } = req.body || {};
  if (!status || !VALID_STATUSES.includes(status)) {
    throw new HttpError(400, 'Status must be one of: approved, pending, rejected');
  }
}

function validateReport(req) {
  const { targetType, targetId, reason } = req.body || {};
  if (!targetType || !['post', 'comment'].includes(targetType)) {
    throw new HttpError(400, 'targetType must be post or comment');
  }
  if (!Number.isInteger(targetId) || targetId <= 0) {
    throw new HttpError(400, 'targetId must be a positive integer');
  }
  if (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 500) {
    throw new HttpError(400, 'Reason must be 3-500 characters');
  }
}

function validateReportStatus(req) {
  const { status } = req.body || {};
  if (!status || !['resolved', 'dismissed'].includes(status)) {
    throw new HttpError(400, 'Status must be resolved or dismissed');
  }
}

function validateCreateCategory(req) {
  const { name } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 50) {
    throw new HttpError(400, 'Category name must be 2-50 characters');
  }
}

module.exports = {
  validateRoleChange,
  validateStatusChange,
  validateReport,
  validateReportStatus,
  validateCreateCategory,
};