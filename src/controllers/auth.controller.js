// ============================================================================
// src/controllers/auth.controller.js — F04 hardened auth + F05 roles + D5
// ============================================================================

const userModel = require('../models/user.model');
const sessionModel = require('../models/session.model');
const identityModel = require('../models/identity.model'); // ← D5: Added at top level
const { hashPassword, verifyPassword } = require('../utils/password');
const { fingerprint } = require('../utils/hash');
const { HttpError } = require('../middleware/errorHandler');
const config = require('../config');

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

module.exports = { register, login, logout, me, changePassword };