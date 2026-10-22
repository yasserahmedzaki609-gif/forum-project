// ============================================================================
// src/auth/providers/google.provider.js — Google OIDC provider (dynamic ESM)
// ----------------------------------------------------------------------------
// openid-client@6 is ESM-only. We lazy-load its named exports inside each
// function, so this module can be require()d from CommonJS without errors.
// ============================================================================

const config = require('../../config');

function getRedirectUri(override) {
  return override || config.sso.google.redirectUri;
}

// ---------------------------------------------------------------------------
// Lazy loader for openid-client named exports.
// ---------------------------------------------------------------------------
async function loadOpenidClient() {
  return await import('openid-client');
}

// ---------------------------------------------------------------------------
// Step 1: Build the authorization URL
// ---------------------------------------------------------------------------
async function buildAuthUrl({ state, nonce, codeChallenge, redirectUri }) {
  const { buildAuthorizationUrl } = await loadOpenidClient();
  const { getGoogleClient } = require('../oidc.client');
  const client = await getGoogleClient();

  const url = buildAuthorizationUrl(client, {
    redirect_uri: getRedirectUri(redirectUri),
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });

  return url.toString();
}

// ---------------------------------------------------------------------------
// Step 2: Exchange the authorization code for tokens
// ---------------------------------------------------------------------------
async function exchangeCode({ code, state, codeVerifier, nonce, redirectUri, currentUrl }) {
  const { authorizationCodeGrant, fetchUserInfo } = await loadOpenidClient();
  const { getGoogleClient } = require('../oidc.client');
  const client = await getGoogleClient();

  // openid-client v6 expects the full callback URL as a URL object.
  const url =
    currentUrl instanceof URL
      ? currentUrl
      : new URL(
          currentUrl ||
            `${getRedirectUri(redirectUri)}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
          config.sso.appBaseUrl
        );

  const tokens = await authorizationCodeGrant(client, url, {
    pkceCodeVerifier: codeVerifier,
    expectedState: state,
    expectedNonce: nonce,
    idTokenExpected: true,
  });

  const claims = tokens.claims();
  if (!claims) {
    throw new Error('Google returned no ID token claims');
  }

  // Optional: fetch userinfo for extra profile fields.
  let userinfo = null;
  try {
    userinfo = await fetchUserInfo(client, tokens.access_token, claims.sub);
  } catch (_) {
    // Non-fatal — we already have claims from the ID token.
  }

  return {
    provider: 'google',
    providerUserId: claims.sub,
    email: claims.email || (userinfo && userinfo.email) || null,
    emailVerified:
      claims.email_verified === true || (userinfo && userinfo.email_verified === true) || false,
    displayName: (userinfo && userinfo.name) || claims.name || claims.email || 'Google User',
    avatarUrl: (userinfo && userinfo.picture) || claims.picture || null,
  };
}

module.exports = { buildAuthUrl, exchangeCode };
