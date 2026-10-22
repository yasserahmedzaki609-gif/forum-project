// ============================================================================
// src/validators/comment.validator.js
// ============================================================================

const { HttpError } = require('../middleware/errorHandler');

function validateCreateComment(req) {
  const { content } = req.body || {};
  if (typeof content !== 'string' || content.trim().length < 1 || content.length > 2000) {
    throw new HttpError(400, 'Comment must be 1-2000 characters');
  }
}

function validateUpdateComment(req) {
  const { content, updatedAt } = req.body || {};
  if (typeof content !== 'string' || content.trim().length < 1 || content.length > 2000) {
    throw new HttpError(400, 'Comment must be 1-2000 characters');
  }
  if (!updatedAt || typeof updatedAt !== 'string') {
    throw new HttpError(400, 'updatedAt is required for edit (stale update protection)');
  }
}

module.exports = { validateCreateComment, validateUpdateComment };
