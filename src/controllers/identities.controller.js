// ============================================================================
// src/controllers/identities.controller.js — C3 Identities management
// ----------------------------------------------------------------------------
// Users can:
//   - see which SSO providers are linked to their account
//   - unlink a provider (e.g. after a compromise)
//
// Safety rule: a user cannot unlink their last authentication method.
// A user with no password (SSO-only) who unlinks their only provider would
// be locked out permanently. We prevent that here.
//
// On successful unlink, ALL of the user's other sessions are revoked
// (in case an attacker was authenticated via the compromised provider)
// and a fresh session is created for the current device.
// ============================================================================

const identityModel = require('../models/identity.model');
const userModel = require('../models/user.model');
const sessionModel = require('../models/session.model');
const config = require('../config');
const { HttpError } = require('../middleware/errorHandler');
const { fingerprint } = require('../utils/hash');
const logger = require('../utils/logger');

const VALID_PROVIDERS = ['google', 'github'];

// ---------------------------------------------------------------------------
// GET /api/users/me/identities
// ---------------------------------------------------------------------------
function listMyIdentities(req, res, next) {
  try {
    const identities = identityModel.listForUser(req.user.id);
    const user = userModel.findByIdWithPassword(req.user.id);

    // SSO-only users have a password starting with '!'
    const hasPassword = !!(user.password && !user.password.startsWith('!'));

    // User can unlink iff they either have a password OR have >1 provider
    const canUnlink = hasPassword || identities.length > 1;

    res.json({
      identities: identities.map((i) => ({
        provider: i.provider,
        email: i.email,
        displayName: i.display_name,
        avatarUrl: i.avatar_url,
        linkedAt: i.created_at,
      })),
      hasPassword,
      canUnlink,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/users/me/identities/:provider
// ---------------------------------------------------------------------------
function unlinkIdentity(req, res, next) {
  try {
    const provider = req.params.provider;
    if (!VALID_PROVIDERS.includes(provider)) {
      throw new HttpError(400, `Invalid provider. Allowed: ${VALID_PROVIDERS.join(', ')}`);
    }

    const identities = identityModel.listForUser(req.user.id);
    const target = identities.find((i) => i.provider === provider);
    if (!target) {
      throw new HttpError(404, `No ${provider} identity linked to your account`);
    }

    const user = userModel.findByIdWithPassword(req.user.id);
    const hasPassword = !!(user.password && !user.password.startsWith('!'));

    // Safety: user would be locked out with no way back in
    if (!hasPassword && identities.length === 1) {
      throw new HttpError(
        409,
        'Cannot unlink your only authentication method. ' +
          'Set a password first from the Change Password dialog.'
      );
    }

    const deleted = identityModel.deleteByUserAndProvider(req.user.id, provider);
    if (!deleted) {
      throw new HttpError(500, 'Failed to unlink identity');
    }

    // Revoke all OTHER sessions — in case an attacker was authenticated
    // via the compromised provider. Then create a fresh session for
    // the current device so the user stays logged in here.
    const ua = req.get('user-agent');
    const uaHash = config.session.bindToUserAgent && ua ? fingerprint(ua) : null;
    sessionModel.deleteAllForUser(req.user.id);
    const newSession = sessionModel.create(req.user.id, config.session.maxAgeMs, uaHash);
    req.session.sid = newSession.id;

    logger.info(`User ${req.user.id} unlinked ${provider}; other sessions revoked`);

    res.json({
      ok: true,
      unlinked: provider,
      remaining: identities.length - 1,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listMyIdentities, unlinkIdentity };
