// ============================================================================
// src/auth/providers/github.provider.js — GitHub OAuth2 provider
// ----------------------------------------------------------------------------
// GitHub does NOT support OIDC discovery, so we use raw OAuth2.
// We implement PKCE + state with our own helpers.
//
// GitHub email handling:
//   - /user may return null email (private profile).
//   - We fall back to /user/emails and pick the primary one.
// ============================================================================

const config = require('../../config');
const logger = require('../../utils/logger');

const TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// fetch with timeout and JSON parsing (with urlencoded fallback)
// ---------------------------------------------------------------------------
async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'forum-app/1.0',
        ...(options.headers || {}),
      },
    });

    const text = await res.text();

    if (!res.ok) {
      logger.warn(`GitHub API error ${res.status}`, { url, text });
      throw new Error(`GitHub API error: ${res.status}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      // GitHub sometimes returns urlencoded when Accept isn't honored.
      return Object.fromEntries(new URLSearchParams(text));
    }
  } finally {
    clearTimeout(timer);
  }
}

function getRedirectUri(override) {
  return override || config.sso.github.redirectUri;
}

// ---------------------------------------------------------------------------
// Step 1: Build the authorization URL
// ---------------------------------------------------------------------------
function buildAuthUrl({ state, codeChallenge, redirectUri }) {
  const url = new URL(config.sso.github.authorizationEndpoint);

  url.searchParams.set('client_id', config.sso.github.clientId);
  url.searchParams.set('redirect_uri', getRedirectUri(redirectUri));
  url.searchParams.set('scope', config.sso.github.scope);
  url.searchParams.set('state', state);
  // GitHub supports PKCE since 2023.
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('allow_signup', 'true');

  return url.toString();
}

// ---------------------------------------------------------------------------
// Step 2: Exchange code for access token and fetch profile
// ---------------------------------------------------------------------------
async function exchangeCode({ code, codeVerifier, redirectUri }) {
  const body = new URLSearchParams({
    client_id: config.sso.github.clientId,
    client_secret: config.sso.github.clientSecret,
    code,
    redirect_uri: getRedirectUri(redirectUri),
    code_verifier: codeVerifier,
  });

  const token = await fetchJson(config.sso.github.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!token.access_token) {
    throw new Error(`GitHub token exchange failed: ${token.error || 'unknown_error'}`);
  }

  const user = await fetchJson(config.sso.github.userInfoEndpoint, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });

  // GitHub may hide the primary email on /user. Fetch /user/emails.
  let email = user.email || null;
  let emailVerified = false;

  if (!email) {
    try {
      const emails = await fetchJson(config.sso.github.emailsEndpoint, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      const primary = emails.find((e) => e.primary) || emails[0];
      if (primary) {
        email = primary.email;
        emailVerified = primary.verified === true;
      }
    } catch (err) {
      logger.warn('Failed to fetch GitHub emails', { message: err.message });
    }
  }

  return {
    provider: 'github',
    providerUserId: String(user.id),
    email,
    emailVerified,
    displayName: user.name || user.login || 'GitHub User',
    avatarUrl: user.avatar_url || null,
  };
}

module.exports = { buildAuthUrl, exchangeCode };
