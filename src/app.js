// ============================================================================
// src/app.js — Express application assembly
// ----------------------------------------------------------------------------
// This file wires the middleware chain and mounts routes.
// It does NOT start the server (that's server.js).
//
// Middleware order (critical):
//   1. Security headers
//   2. Body parsers (bounded)
//   3. Session cookies (signed)
//   4. Rate limiter
//   5. attachSession (DB-validated)
//   6. CSRF protection
//   7. Static files
//   8. Routes
//   9. 404 handler
//  10. Central error handler
// ============================================================================

const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');

const config = require('./config');
const logger = require('./utils/logger');
const { attachSession } = require('./middleware/auth');
const { csrfProtection } = require('./middleware/csrf');
const { generalLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

// ---------------------------------------------------------------------------
// Trust proxy
// ---------------------------------------------------------------------------
// Enables correct client IP detection behind a reverse proxy (nginx, traefik).
// Required for rate limiting to work correctly in production.
// ---------------------------------------------------------------------------
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
// Applied to every response. CSP is intentionally strict:
//   - default-src 'self'        → only same-origin resources by default
//   - script-src 'self'         → no inline scripts, no remote scripts
//   - style-src 'self' + inline → current stylesheet uses inline style attrs
//   - img-src 'self' + data:    → our media route + data URIs (icons)
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "form-action 'self'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self';"
  );
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // F04: Enhanced HSTS with preload and 2-year max-age
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );
  
  next();
});

// ---------------------------------------------------------------------------
// Body parsers (bounded)
// ---------------------------------------------------------------------------
// Global JSON limit (10kb default) prevents DoS via large payloads.
// Multipart uploads bypass these parsers and are handled by busboy
// directly in the media controller with their own limits.
// ---------------------------------------------------------------------------
app.use(express.json({ limit: config.body.limit }));
app.use(express.urlencoded({ extended: false, limit: config.body.limit }));

// ---------------------------------------------------------------------------
// Sessions (signed cookie carrying only the session id)
// ---------------------------------------------------------------------------
// The cookie holds an opaque UUID, not user data.
// The actual session is stored server-side in the `sessions` table.
// ---------------------------------------------------------------------------
app.use(
  cookieSession({
    name: config.session.name,
    keys: config.session.keys,
    maxAge: config.session.maxAgeMs,
    secure: config.session.secure,
    httpOnly: config.session.httpOnly,
    sameSite: config.session.sameSite,
  })
);

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
// Applied globally. Auth endpoints get a stricter limiter in their routes.
// ---------------------------------------------------------------------------
app.use(generalLimiter);

// ---------------------------------------------------------------------------
// Attach user (DB-validated session)
// ---------------------------------------------------------------------------
// Reads req.session.sid, looks it up in SQLite, and sets req.user.
// Never rejects — routes decide whether auth is required.
// ---------------------------------------------------------------------------
app.use(attachSession);

// ---------------------------------------------------------------------------
// CSRF protection
// ---------------------------------------------------------------------------
// - Issues a signed token on every request (via cookie)
// - Verifies token on POST/PUT/PATCH/DELETE via header, body, or query
// ---------------------------------------------------------------------------
app.use(csrfProtection);

// Expose the CSRF token to templates (if any server-rendered views use it)
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken;
  next();
});

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------
// Serves public/ (HTML, CSS, JS). Media files are NOT served here —
// they are streamed through /api/media/:id to enforce headers.
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------------------------------------------------------------------
// Application routes
// ---------------------------------------------------------------------------
// All routes (F01, F02, F03, F04) are mounted via routes/index.js.
// ---------------------------------------------------------------------------
app.use(routes);

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
// Must come AFTER all routes. Returns JSON so API clients get a clean error.
// ---------------------------------------------------------------------------
app.use(notFound);

// ---------------------------------------------------------------------------
// Central error handler
// ---------------------------------------------------------------------------
// Must be the LAST middleware. Never leaks internal details in production.
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Periodic cleanup tasks
// ---------------------------------------------------------------------------
// These run in-process. In a multi-instance deployment, use a cron job
// or a leader election mechanism to avoid duplicate cleanup.
// ---------------------------------------------------------------------------

// Expired sessions: hourly
setInterval(() => {
  try {
    const sessionModel = require('./models/session.model');
    sessionModel.deleteExpired();
  } catch (e) {
    logger.error('Session cleanup failed', e);
  }
}, 60 * 60 * 1000).unref();

// Expired OAuth states: every 10 minutes
setInterval(() => {
  try {
    const oauthStateModel = require('./models/oauthState.model');
    oauthStateModel.cleanupExpired();
  } catch (e) {
    logger.error('OAuth state cleanup failed', e);
  }
}, 10 * 60 * 1000).unref();

module.exports = app;