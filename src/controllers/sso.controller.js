// ============================================================================
// src/controllers/sso.controller.js — SSO start / callback / status (F04)
// ============================================================================

const {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  generateNonce,
} = require('../auth/pkce');

const { getProvider, listEnabled } = require('../auth/providers');
const oauthStateModel = require('../models/oauthState.model');
const sessionModel = require('../models/session.model');
const identityService = require('../auth/identity.service');
const config = require('../config');
const logger = require('../utils/logger');
const { fingerprint } = require('../utils/hash');
const { HttpError } = require('../middleware/errorHandler');

// ---------------------------------------------------------------------------
// sanitizeRedirect — same-origin only
// ---------------------------------------------------------------------------
function sanitizeRedirect(to) {
  if (!to || typeof to !== 'string') return null;
  try {
    const base = new URL(config.sso.appBaseUrl);
    const target = new URL(to, base);
    if (target.origin !== base.origin) return null;
    return target.pathname + target.search;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GET /auth/providers
// ---------------------------------------------------------------------------
function status(req, res) {
  res.json({ providers: listEnabled() });
}

// ---------------------------------------------------------------------------
// GET /auth/:provider — start flow
// ---------------------------------------------------------------------------
async function start(req, res, next) {
  try {
    const providerName = req.params.provider;
    const provider = getProvider(providerName);

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();
    const nonce = generateNonce();

    const linkUserId = req.user ? req.user.id : null;
    const redirectTo = sanitizeRedirect(req.query.redirect_to);

    oauthStateModel.create({
      state,
      codeVerifier,
      nonce,
      provider: providerName,
      redirectTo,
      linkUserId,
    });

    const url = await provider.buildAuthUrl({ state, nonce, codeChallenge });
    res.redirect(url);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /auth/:provider/callback — F04 hardened
// ---------------------------------------------------------------------------
async function callback(req, res, next) {
  try {
    const providerName = req.params.provider;
    const provider = getProvider(providerName);

    const { code, state, error, error_description } = req.query;

    if (error) {
      throw new HttpError(400, `Provider error: ${error_description || error}`);
    }
    if (!code || !state) {
      throw new HttpError(400, 'Missing code or state');
    }

    // 1. Verify + consume state
    const stored = oauthStateModel.consume(state);
    if (!stored) throw new HttpError(400, 'Invalid or expired state');
    if (stored.provider !== providerName) {
      throw new HttpError(400, 'Provider mismatch');
    }

    // 2. Exchange code
    const currentUrl = new URL(req.originalUrl, config.sso.appBaseUrl);
    const profile = await provider.exchangeCode({
      code,
      state,
      codeVerifier: stored.code_verifier,
      nonce: stored.nonce,
      currentUrl,
    });

    // 3. Resolve or link user
    const result = identityService.resolveUser(profile, {
      linkUserId: stored.link_user_id || null,
    });

    // 4. F04: global logout + create session with UA binding
    sessionModel.deleteAllForUser(result.userId);

    const ua = req.get('user-agent');
    const uaHash = config.session.bindToUserAgent && ua ? fingerprint(ua) : null;

    const session = sessionModel.create(result.userId, config.session.maxAgeMs, uaHash);
    req.session.sid = session.id;

    logger.info(
      `SSO callback ok: provider=${providerName} user=${result.userId} ` +
        `created=${result.created} linked=${result.linked}`
    );

    // 5. Redirect back
    const target = stored.redirect_to || '/';
    res.redirect(target);
  } catch (err) {
    next(err);
  }
}

module.exports = { status, start, callback };
