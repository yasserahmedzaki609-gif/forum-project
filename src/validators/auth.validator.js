// ============================================================================
// src/validators/auth.validator.js — Register / Login validation
// ============================================================================

const { HttpError } = require('../middleware/errorHandler');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

function validateRegister(req) {
  const { username, email, password } = req.body || {};

  if (!username || !email || !password) {
    throw new HttpError(400, 'All fields are required');
  }

  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw new HttpError(
      400,
      'Username must be 3-30 chars: letters, digits, underscore'
    );
  }

  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    throw new HttpError(400, 'Invalid email format');
  }

  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    throw new HttpError(400, 'Password must be 8-72 characters');
  }
}

function validateLogin(req) {
  const { username, password } = req.body || {};

  if (!username || !password) {
    throw new HttpError(400, 'Username and password required');
  }

  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new HttpError(400, 'Invalid credentials payload');
  }

  if (username.length > 60 || password.length > 200) {
    throw new HttpError(400, 'Invalid credentials payload');
  }
}

// ---------------------------------------------------------------------------
// validateChangePassword — POST /api/users/me/password
// ---------------------------------------------------------------------------
function validateChangePassword(req) {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    throw new HttpError(400, 'Both currentPassword and newPassword are required');
  }

  if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
    throw new HttpError(400, 'Invalid current password');
  }

  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 72) {
    throw new HttpError(400, 'New password must be 8-72 characters');
  }

  if (currentPassword === newPassword) {
    throw new HttpError(400, 'New password must differ from the current one');
  }
}

module.exports = { validateRegister, validateLogin, validateChangePassword };