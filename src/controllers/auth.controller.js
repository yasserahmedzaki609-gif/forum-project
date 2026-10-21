// ============================================================================
// src/controllers/auth.controller.js — F04 hardened auth + F05 roles + D5 + C4
// ============================================================================

const userModel = require('../models/user.model');
const sessionModel = require('../models/session.model');
const identityModel = require('../models/identity.model'); // ← D5: Added at top level
const { hashPassword, verifyPassword } = require('../utils/password');
const { fingerprint } = require('../utils/hash');
const { HttpError } = require('../middleware/errorHandler');
const config = require('../config');
const db = require('../database/db'); // ← C4: Added for admin count check
const logger = require('../utils/logger'); // ← C4: Added for audit logging

function uaHashFrom(req) {
  if (!config.session.bindToUserAgent) return null;
  const ua = req.get('user-agent');
  return ua ? fingerprint(ua) : null;
}

// ---------------------------------------------------------------------------
// POST /register
// ---------------------------------------------------------------------------
async function register(req, res, next) {
  try {
    const { username, email, password } = req.body;

    if (userModel.findByEmail(email)) throw new HttpError(409, 'Email already registered');
    if (userModel.findByUsername(username)) throw new HttpError(409, 'Username taken');

    const hash = await hashPassword(password);
    
    // F05: First user becomes admin
    const role = userModel.countAll() === 0 ? 'admin' : 'user';
    const user = userModel.create(username, email, hash, role);

    res.status(201).json({ id: user.id, username: user.username, role: user.role });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return next(new HttpError(409, 'Username or email already taken'));
    }
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------
async function login(req, res, next) {
  try {
    const { username, password } = req.body;

    const user = userModel.findByUsername(username);
    if (!user) throw new HttpError(401, 'Invalid credentials');

    const ok = await verifyPassword(password, user.password);
    if (!ok) throw new HttpError(401, 'Invalid credentials');

    sessionModel.deleteAllForUser(user.id);

    const s = sessionModel.create(
      user.id,
      config.session.maxAgeMs,
      uaHashFrom(req)
    );
    req.session.sid = s.id;

    res.json({ id: user.id, username: user.username, role: user.role });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /logout
// ---------------------------------------------------------------------------
function logout(req, res, next) {
  try {
    if (req.user && req.user.sessionId) {
      sessionModel.delete(req.user.sessionId);
    }
    req.session = null;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /me
// ---------------------------------------------------------------------------
function me(req, res) {
  if (!req.user) return res.status(401).json({ loggedIn: false });

  // D5: include linked SSO identities so the UI can render "Connected Accounts"
  const identities = identityModel.listForUser(req.user.id);

  res.json({
    loggedIn: true,
    id: req.user.id,
    username: req.user.username,
    role: req.user.role,
    identities: identities.map((i) => ({
      provider: i.provider,
      email: i.email,
    })),
  });
}

// ---------------------------------------------------------------------------
// POST /api/users/me/password
// ---------------------------------------------------------------------------
async function changePassword(req, res, next) {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    const user = userModel.findByIdWithPassword(userId);
    if (!user) throw new HttpError(404, 'User not found');

    const ok = await verifyPassword(currentPassword, user.password);
    if (!ok) throw new HttpError(401, 'Current password is incorrect');

    const newHash = await hashPassword(newPassword);
    const updated = userModel.updatePassword(userId, newHash);
    if (!updated) throw new HttpError(500, 'Failed to update password');

    // F04-FIX (B2): Invalidate ALL sessions for this user
    sessionModel.deleteAllForUser(userId);

    // Then create a fresh session for the CURRENT device
    const newSession = sessionModel.create(
      userId,
      config.session.maxAgeMs,
      uaHashFrom(req)
    );
    req.session.sid = newSession.id;

    res.json({
      ok: true,
      message: 'Password updated. All other sessions revoked.',
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// C4: DELETE /api/users/me — permanent account deletion
// ---------------------------------------------------------------------------
// Safety rules:
//   - Password users: must supply currentPassword
//   - SSO-only users (unusable password): must type their exact username
//   - The only admin cannot delete themselves (would lock the forum)
//   - CSRF protected (all mutations require token)
//
// Data:
//   - ON DELETE CASCADE removes: sessions, posts, comments, reactions,
//     media, identities, reports, role_requests (as user_id)
//   - moderation_logs.actor_id → SET NULL (preserved for audit)
//   - role_requests.reviewed_by → SET NULL (preserved for audit)
// ---------------------------------------------------------------------------
async function deleteAccount(req, res, next) {
  try {
    const userId = req.user.id;
    const { password, confirmation } = req.body || {};

    const user = userModel.findByIdWithPassword(userId);
    if (!user) throw new HttpError(404, 'User not found');

    const hasPassword = user.password && !user.password.startsWith('!');

    // Authentication check
    if (hasPassword) {
      if (!password || typeof password !== 'string') {
        throw new HttpError(400, 'Password required to delete account');
      }
      const ok = await verifyPassword(password, user.password);
      if (!ok) throw new HttpError(401, 'Incorrect password');
    } else {
      // SSO-only: require typing the exact username
      if (!confirmation || confirmation !== user.username) {
        throw new HttpError(400, `Type your username "${user.username}" to confirm`);
      }
    }

    // Last admin protection
    if (user.role === 'admin') {
      const adminCount = db
        .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")
        .get().c;
      if (adminCount <= 1) {
        throw new HttpError(
          409,
          'Cannot delete the only admin account. Promote another user first.'
        );
      }
    }

    // Delete
    const deleted = userModel.deleteById(userId);
    if (!deleted) throw new HttpError(500, 'Failed to delete account');

    req.session = null;
    logger.info(`Account deleted: user_id=${userId} username=${user.username}`);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  logout,
  me,
  changePassword,
  deleteAccount, // ← C4: جديد
};