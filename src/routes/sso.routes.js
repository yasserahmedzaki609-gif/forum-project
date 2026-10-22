// ============================================================================
// src/routes/sso.routes.js — F02 SSO routes
// ----------------------------------------------------------------------------
// GET /auth/providers              → public status (which providers enabled)
// GET /auth/:provider              → start flow (redirect to provider)
// GET /auth/:provider/callback     → handle callback
// ============================================================================

const express = require('express');
const router = express.Router();

const sso = require('../controllers/sso.controller');
const config = require('../config');
const { authLimiter } = require('../middleware/rateLimit');
const { HttpError } = require('../middleware/errorHandler');

// Reject disabled providers before hitting the controller.
function ensureEnabled(req, res, next) {
  const name = req.params.provider;
  const enabled =
    (name === 'google' && config.sso.google.enabled) ||
    (name === 'github' && config.sso.github.enabled);

  if (!enabled) {
    return next(new HttpError(404, 'Provider not enabled'));
  }
  next();
}

// Public status endpoint (frontend uses it to show/hide SSO buttons).
router.get('/auth/providers', sso.status);

// Start + callback. Rate-limited to prevent abuse.
router.get('/auth/:provider', ensureEnabled, authLimiter, sso.start);
router.get('/auth/:provider/callback', ensureEnabled, authLimiter, sso.callback);

module.exports = router;
