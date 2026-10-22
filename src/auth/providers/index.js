// ============================================================================
// src/auth/providers/index.js — Provider registry
// ----------------------------------------------------------------------------
// Both providers expose the same interface:
//   - buildAuthUrl({ state, nonce, codeChallenge, redirectUri }) -> string
//   - exchangeCode({ code, state, codeVerifier, nonce, redirectUri, currentUrl })
//       -> { provider, providerUserId, email, emailVerified, displayName, avatarUrl }
//
// Note: buildAuthUrl is a naming convention we own. Google's underlying
// openid-client function is called `buildAuthorizationUrl`, but we alias it
// in google.provider.js to keep the two providers symmetrical.
// ============================================================================

const google = require('./google.provider');
const github = require('./github.provider');

const providers = {
  google: { name: 'google', ...google },
  github: { name: 'github', ...github },
};

function getProvider(name) {
  const p = providers[name];
  if (!p) {
    const err = new Error(`Unknown provider: ${name}`);
    err.status = 404;
    throw err;
  }
  return p;
}

function listEnabled() {
  // Lazy require to avoid circular dependency at module load time.
  const config = require('../../config');
  return {
    google: config.sso.google.enabled,
    github: config.sso.github.enabled,
  };
}

module.exports = { getProvider, providers, listEnabled };
