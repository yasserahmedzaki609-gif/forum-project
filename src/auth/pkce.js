// ============================================================================
// src/auth/pkce.js — PKCE helpers (RFC 7636)
// ----------------------------------------------------------------------------
// We keep our own implementation instead of relying on openid-client
// internals, so the module is portable and easy to test.
//
// All values are base64url-encoded without padding, as required by RFC 7636.
// ============================================================================

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// base64url encoding (RFC 4648 §5) without padding
// ---------------------------------------------------------------------------
function base64url(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Code verifier
// ---------------------------------------------------------------------------
// 32 random bytes -> ~43 chars after base64url.
// RFC 7636 requires 43–128 characters from the unreserved set.
// ---------------------------------------------------------------------------
function generateCodeVerifier() {
  return base64url(crypto.randomBytes(32));
}

// ---------------------------------------------------------------------------
// Code challenge (S256)
// ---------------------------------------------------------------------------
// SHA-256 of the verifier, then base64url-encoded.
// The "plain" method is deliberately not implemented — it is insecure.
// ---------------------------------------------------------------------------
function generateCodeChallenge(verifier) {
  const digest = crypto.createHash('sha256').update(verifier).digest();
  return base64url(digest);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
// Random opaque value that binds the callback to this specific flow.
// Stored server-side, single-use, TTL-bounded.
// ---------------------------------------------------------------------------
function generateState() {
  return base64url(crypto.randomBytes(32));
}

// ---------------------------------------------------------------------------
// Nonce (OIDC)
// ---------------------------------------------------------------------------
// Random value sent to the provider and verified inside the ID token.
// Prevents replay of an old ID token.
// ---------------------------------------------------------------------------
function generateNonce() {
  return base64url(crypto.randomBytes(16));
}

// ---------------------------------------------------------------------------
// Constant-time comparison
// ---------------------------------------------------------------------------
// Defense-in-depth: usable anywhere we compare two secrets.
// ---------------------------------------------------------------------------
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

module.exports = {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  generateNonce,
  safeEqual,
};