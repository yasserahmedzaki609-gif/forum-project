// ============================================================================
// src/validators/post.validator.js — Create and Update post validation
// ============================================================================

const { HttpError } = require('../middleware/errorHandler');

// ---------------------------------------------------------------------------
// validateCreatePost — POST /api/posts
// ---------------------------------------------------------------------------
function validateCreatePost(req) {
  const { title, content, categoryIds } = req.body || {};

  if (typeof title !== 'string' || title.trim().length < 3 || title.length > 150) {
    throw new HttpError(400, 'Title must be 3-150 characters');
  }

  if (typeof content !== 'string' || content.trim().length < 1 || content.length > 5000) {
    throw new HttpError(400, 'Content must be 1-5000 characters');
  }

  if (!Array.isArray(categoryIds) || categoryIds.length === 0 || categoryIds.length > 10) {
    throw new HttpError(400, 'Select between 1 and 10 categories');
  }

  for (const id of categoryIds) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, 'Invalid category id');
    }
  }
}

// ---------------------------------------------------------------------------
// validateUpdatePost — PUT /api/posts/:postId
// Includes updatedAt for optimistic locking (stale update protection).
// ---------------------------------------------------------------------------
function validateUpdatePost(req) {
  const { title, content, categoryIds, updatedAt } = req.body || {};

  if (typeof title !== 'string' || title.trim().length < 3 || title.length > 150) {
    throw new HttpError(400, 'Title must be 3-150 characters');
  }

  if (typeof content !== 'string' || content.trim().length < 1 || content.length > 5000) {
    throw new HttpError(400, 'Content must be 1-5000 characters');
  }

  if (!Array.isArray(categoryIds) || categoryIds.length === 0 || categoryIds.length > 10) {
    throw new HttpError(400, 'Select between 1 and 10 categories');
  }

  if (!updatedAt || typeof updatedAt !== 'string') {
    throw new HttpError(400, 'updatedAt is required for edit (stale update protection)');
  }
}

module.exports = { validateCreatePost, validateUpdatePost };
