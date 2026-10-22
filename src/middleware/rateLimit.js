// ============================================================================
// src/middleware/rateLimit.js — F04 rate limiters (IPv6-safe)
// ----------------------------------------------------------------------------
// All custom keyGenerators that fall back to IP must use ipKeyGenerator()
// to apply IPv6 subnet masking (/56) and prevent per-address bypass.
// ============================================================================

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const config = require('../config');

// ---------------------------------------------------------------------------
// Key generators
// ---------------------------------------------------------------------------
// userOrIpKey — for authenticated routes (req.user is guaranteed)
function userOrIpKey(req) {
  if (req.user && req.user.id) return `u:${req.user.id}`;
  // IPv6-safe fallback
  return `ip:${ipKeyGenerator(req.ip)}`;
}

// usernameOrIpKey — for login (prevents brute-force across IPs)
function usernameOrIpKey(req) {
  const u = (req.body && req.body.username) || '';
  if (u) return `login:${String(u).toLowerCase()}`;
  // IPv6-safe fallback
  return `ip:${ipKeyGenerator(req.ip)}`;
}

// ---------------------------------------------------------------------------
// Global flood defense (IP-based, applied before auth)
// ---------------------------------------------------------------------------
const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

// ---------------------------------------------------------------------------
// Auth flood defense (IP-based, applied on register)
// ---------------------------------------------------------------------------
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts.' },
});

// ---------------------------------------------------------------------------
// Login: username-based (targeted brute-force defense)
// ---------------------------------------------------------------------------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: usernameOrIpKey,
  message: { error: 'Too many login attempts for this account.' },
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

// ---------------------------------------------------------------------------
// Post creation: user-based
// ---------------------------------------------------------------------------
const postCreateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: 'Too many posts created. Please wait.' },
});

// ---------------------------------------------------------------------------
// Comment creation: user-based
// ---------------------------------------------------------------------------
const commentCreateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: 'Too many comments. Please slow down.' },
});

// ---------------------------------------------------------------------------
// Reactions (like/dislike): user-based
// ---------------------------------------------------------------------------
const reactionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: 'Too many reactions. Please slow down.' },
});

// ---------------------------------------------------------------------------
// Media upload: user-based
// ---------------------------------------------------------------------------
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: 'Too many uploads, please wait.' },
});

// ---------------------------------------------------------------------------
// F04-FIX (C2): Report submission: user-based, prevents flooding the
// moderation queue with bogus reports (DoS on moderators).
// ---------------------------------------------------------------------------
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 reports/hour/user
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: 'Too many reports submitted. Please wait.' },
});

module.exports = {
  generalLimiter,
  authLimiter,
  loginLimiter,
  postCreateLimiter,
  commentCreateLimiter,
  reactionLimiter,
  uploadLimiter,
  reportLimiter, // ← جديد
};
