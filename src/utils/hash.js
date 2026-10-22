// ============================================================================
// src/utils/hash.js — SHA-256 helpers
// ============================================================================

const crypto = require('crypto');

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Hash a string (e.g., user-agent) to a fixed-size fingerprint.
// 128 bits (32 hex chars) is more than enough for UA comparison.
function fingerprint(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}

module.exports = { sha256Hex, fingerprint };
