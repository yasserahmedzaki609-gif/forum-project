// ============================================================================
// src/auth/oidc.client.js — Google OIDC discovery (dynamic ESM import)
// ----------------------------------------------------------------------------
// openid-client@6 is ESM-only. We lazy-load it with await import() inside
// the function, so this module is safe to require() from CommonJS.
//
// The client is cached (as a Promise) to avoid repeated discovery calls.
// ============================================================================

const config = require('../config');
const logger = require('../utils/logger');

// Cache: issuerUrl -> Promise<Client>
const cache = new Map();

async function getGoogleClient() {
  const key = config.sso.google.issuerUrl;
  if (cache.has(key)) return cache.get(key);

  const promise = (async () => {
    logger.info(`Discovering OIDC issuer: ${key}`);

    // Dynamic import: works with ESM-only packages from CommonJS.
    const { discovery, ClientSecretPost } = await import('openid-client');

    const issuerUrl = new URL(key);

    const client = await discovery(
      issuerUrl,
      config.sso.google.clientId,
      ClientSecretPost(config.sso.google.clientSecret)
    );

    return client;
  })();

  cache.set(key, promise);

  try {
    return await promise;
  } catch (err) {
    // Allow retry on next call if discovery failed.
    cache.delete(key);
    throw err;
  }
}

module.exports = { getGoogleClient };
