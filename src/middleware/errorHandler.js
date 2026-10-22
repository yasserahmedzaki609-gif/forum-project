// ============================================================================
// src/middleware/errorHandler.js — HttpError + 404 + Central error handler
// ----------------------------------------------------------------------------
// In production, 5xx responses never leak internal details. Full stack is
// logged server-side only.
// ============================================================================

const logger = require('../utils/logger');
const config = require('../config');

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// 404 for unknown routes (JSON, not HTML — API-friendly)
function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Central error handler — must be the last middleware.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;

  if (status >= 500) {
    logger.error('Unhandled error', {
      message: err.message,
      stack: err.stack,
      path: req.originalUrl,
      method: req.method,
    });
  }

  const safeMessage = status >= 500 ? 'Internal server error' : err.message || 'Request error';

  res.status(status).json({
    error: safeMessage,
    // F04-FIX (H1+): Only expose code + stack in explicit development mode.
    //
    // Previously this used `config.isProd ? {} : {...}`, which included
    // stack in BOTH development AND test environments. But test mode has
    // no legitimate reason to leak stack — stack traces are still written
    // to server-side logs (logger.error) for developers, so nothing is lost.
    //
    // This is defense in depth: production, test, and any future NODE_ENV
    // other than 'development' will hide internal details from HTTP clients.
    ...(config.env === 'development' ? { code: err.code, stack: err.stack } : {}),
  });
}

module.exports = { HttpError, notFound, errorHandler };
