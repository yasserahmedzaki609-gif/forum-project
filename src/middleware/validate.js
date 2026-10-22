// ============================================================================
// src/middleware/validate.js — Validator wrapper
// ----------------------------------------------------------------------------
// Wraps a synchronous validator function so it can be used as Express
// middleware. The validator throws HttpError on failure.
// ============================================================================

const { HttpError } = require('./errorHandler');

function validate(validatorFn) {
  return (req, res, next) => {
    try {
      validatorFn(req);
      next();
    } catch (err) {
      if (err instanceof HttpError) return next(err);
      next(new HttpError(400, err.message || 'Invalid request'));
    }
  };
}

module.exports = { validate };
