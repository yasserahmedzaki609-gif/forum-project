// ============================================================================
// src/utils/password.js — bcrypt hashing
// ----------------------------------------------------------------------------
// Cost factor 12 (~200ms per hash on modern hardware). This is the current
// recommendation from OWASP for password storage with bcrypt.
//
// SSO-only users have a password hash starting with '!' (unusable).
// verifyPassword() returns false for those, blocking password login.
// ============================================================================

const bcrypt = require('bcryptjs');

const ROUNDS = 12;

async function hashPassword(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  // SSO-only users have hashes starting with '!'; bcrypt would fail on them.
  if (hash.startsWith('!')) return false;
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword };