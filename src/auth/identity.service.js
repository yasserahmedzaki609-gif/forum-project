// ============================================================================
// src/auth/identity.service.js — Account linking policy
// ----------------------------------------------------------------------------
// The security-critical heart of F02.
//
// Rules:
//   1. If (provider, provider_user_id) exists -> login to that user.
//   2. If email matches an existing user AND email is verified -> link.
//   3. If email matches an existing user BUT email is NOT verified -> REJECT.
//      Otherwise an attacker who registers a provider account with the
//      victim's unverified email could take over the victim's account.
//   4. If no match -> create a new user with an unusable password.
//
// "Link flow" (user already logged in and asks to attach a provider):
//   - If the identity exists and belongs to a different user -> reject.
//   - If it exists and belongs to the current user -> no-op success.
//   - If it doesn't exist -> attach it to the current user.
// ============================================================================

const crypto = require('crypto');

const db = require('../database/db');
const logger = require('../utils/logger');
const { HttpError } = require('../middleware/errorHandler');

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------
const stmtFindIdentity = db.prepare(`
  SELECT id, user_id FROM identities
  WHERE provider = ? AND provider_user_id = ?
`);

const stmtInsertIdentity = db.prepare(`
  INSERT INTO identities
    (user_id, provider, provider_user_id, email, display_name, avatar_url)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const stmtFindUserByEmail = db.prepare(
  'SELECT id, email FROM users WHERE email = ?'
);

const stmtUsernameExists = db.prepare(
  'SELECT 1 FROM users WHERE username = ?'
);

// F04-FIX (B1): Include `role` so we can bootstrap the first-ever user
// (whether local or SSO) as admin. Without this, an SSO-first deployment
// has no admin at all, since auth.controller.register is the only place
// that currently assigns admin.
const stmtInsertUser = db.prepare(
  'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)'
);

// Used to decide if this is the very first user in the system.
const stmtCountUsers = db.prepare('SELECT COUNT(*) AS c FROM users');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// SSO-only users get an unusable password. bcrypt always fails on it because
// it is not a valid bcrypt hash, so password login is effectively disabled.
function unusablePasswordHash() {
  return '!' + crypto.randomBytes(48).toString('base64url');
}

function buildUniqueUsername(base) {
  const clean =
    String(base || 'user')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'user';

  let candidate = clean;
  let i = 1;
  while (stmtUsernameExists.get(candidate)) {
    candidate = `${clean}_${i++}`;
    if (candidate.length > 30) candidate = candidate.slice(0, 30);
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// Link flow (user already logged in)
// ---------------------------------------------------------------------------
const linkTx = db.transaction((linkUserId, profile) => {
  const existing = stmtFindIdentity.get(
    profile.provider,
    profile.providerUserId
  );

  if (existing) {
    if (existing.user_id !== linkUserId) {
      throw new HttpError(
        409,
        'This provider account is already linked to another user'
      );
    }
    return {
      userId: linkUserId,
      created: false,
      linked: false,
      alreadyLinked: true,
    };
  }

  stmtInsertIdentity.run(
    linkUserId,
    profile.provider,
    profile.providerUserId,
    profile.email || null,
    profile.displayName || null,
    profile.avatarUrl || null
  );

  logger.info(`Linked ${profile.provider} identity to user ${linkUserId}`);
  return { userId: linkUserId, created: false, linked: true, alreadyLinked: false };
});

// ---------------------------------------------------------------------------
// Login flow (user not logged in)
// ---------------------------------------------------------------------------
const loginTx = db.transaction((profile) => {
  const {
    provider,
    providerUserId,
    email,
    emailVerified,
    displayName,
    avatarUrl,
  } = profile;

  // Rule 1 — existing identity
  const existing = stmtFindIdentity.get(provider, providerUserId);
  if (existing) {
    return { userId: existing.user_id, created: false, linked: false };
  }

  // Rule 2 + 3 — existing user with matching email
  if (email) {
    const user = stmtFindUserByEmail.get(email);

    if (user) {
      if (!emailVerified) {
        throw new HttpError(
          409,
          'An account with this email already exists. Please sign in with your original method and link this provider from your profile.'
        );
      }

      stmtInsertIdentity.run(
        user.id,
        provider,
        providerUserId,
        email,
        displayName || null,
        avatarUrl || null
      );
      logger.info(`Linked ${provider} identity to existing user ${user.id}`);
      return { userId: user.id, created: false, linked: true };
    }
  }

  // Rule 4 — create new user
  if (!email) {
    throw new HttpError(
      400,
      'Provider did not return an email address; cannot create an account.'
    );
  }

  const username = buildUniqueUsername(displayName || email.split('@')[0]);

  // F04-FIX (B1): Bootstrap the very first user in the system as admin,
  // regardless of whether they came via local register or via SSO.
  // This closes a hole where an SSO-first deployment had no admin and
  // therefore no way to bootstrap moderation.
  const isFirstUser = stmtCountUsers.get().c === 0;
  const role = isFirstUser ? 'admin' : 'user';

  const info = stmtInsertUser.run(
    username,
    email,
    unusablePasswordHash(),
    role
  );
  const userId = info.lastInsertRowid;

  stmtInsertIdentity.run(
    userId,
    provider,
    providerUserId,
    email,
    displayName || null,
    avatarUrl || null
  );

  if (isFirstUser) {
    logger.info(
      `Bootstrapped first user (${username}, id=${userId}) as admin via ${provider}`
    );
  } else {
    logger.info(`Created new user ${userId} via ${provider} (role=${role})`);
  }
  return { userId, created: true, linked: false };
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a provider profile to a local user.
 * @param {object} profile  Provider profile (provider, providerUserId, email, ...)
 * @param {object} [opts]
 * @param {number|null} [opts.linkUserId]  If set, run the link flow for this user.
 */
function resolveUser(profile, opts = {}) {
  if (!profile || !profile.provider || !profile.providerUserId) {
    throw new HttpError(400, 'Invalid provider profile');
  }

  if (opts.linkUserId) {
    return linkTx(opts.linkUserId, profile);
  }
  return loginTx(profile);
}

module.exports = { resolveUser, buildUniqueUsername };