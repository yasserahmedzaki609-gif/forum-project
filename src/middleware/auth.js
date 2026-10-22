// ============================================================================
// src/middleware/auth.js — Session attachment and auth guard
// ============================================================================

const sessionModel = require('../models/session.model');
const { fingerprint } = require('../utils/hash');
const { HttpError } = require('./errorHandler');

function attachSession(req, res, next) {
  req.user = null;

  const sid = req.session && req.session.sid;
  if (sid) {
    const uaHash = req.get('user-agent') ? fingerprint(req.get('user-agent')) : null;
    const row = sessionModel.findValid(sid, uaHash);

    if (row) {
      req.user = {
        id: row.user_id,
        username: row.username,
        sessionId: row.id,
        role: row.role, // ⬅️ F05: Role from session JOIN
      };
    } else {
      req.session = null;
    }
  }

  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  next();
}

function requireModerator(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  if (req.user.role !== 'moderator' && req.user.role !== 'admin') {
    return next(new HttpError(403, 'Moderator or Admin access required'));
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  if (req.user.role !== 'admin') {
    return next(new HttpError(403, 'Admin access required'));
  }
  next();
}

module.exports = { attachSession, requireAuth, requireModerator, requireAdmin };
