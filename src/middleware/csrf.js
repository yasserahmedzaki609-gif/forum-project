// ============================================================================
// src/middleware/csrf.js — Double-submit cookie CSRF protection
// ----------------------------------------------------------------------------
// cookie-session does NOT expose req.cookies. We read the CSRF cookie
// directly from req.headers.cookie with a tiny parser (no cookie-parser dep).
//
// Token format: <raw>.<signature>
//   signature = HMAC-SHA256(raw, CSRF_SECRET)
// ============================================================================

const crypto = require('crypto');

const config = require('../config');
const { HttpError } = require('./errorHandler');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// ---------------------------------------------------------------------------
// readCookie — parse a single cookie from req.headers.cookie
// ---------------------------------------------------------------------------
// Handles URL-encoded values and cookies with '=' inside the value.
// ---------------------------------------------------------------------------
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;

    const k = part.slice(0, eq).trim();
    if (k !== name) continue;

    const v = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// HMAC signature
// ---------------------------------------------------------------------------
function sign(token) {
  return crypto
    .createHmac('sha256', config.csrf.secret)
    .update(token)
    .digest('hex');
}

// ---------------------------------------------------------------------------
// issueToken — set a signed csrf_token cookie and return its value
// ---------------------------------------------------------------------------
function issueToken(res) {
  const raw = crypto.randomBytes(32).toString('hex');
  const signed = `${raw}.${sign(raw)}`;

  res.cookie(config.csrf.cookieName, signed, {
    httpOnly: false, // must be readable by frontend JS
    secure: config.session.secure,
    sameSite: 'lax',
    maxAge: config.session.maxAgeMs,
    path: '/',
  });

  return signed;
}

// ---------------------------------------------------------------------------
// verify — constant-time comparison of HMACs
// ---------------------------------------------------------------------------
function verify(raw, signed) {
  if (!raw || !signed) return false;
  if (!signed.startsWith(raw + '.')) return false;

  const expected = sign(raw);
  const provided = signed.slice(raw.length + 1);

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// csrfProtection
// ---------------------------------------------------------------------------
function csrfProtection(req, res, next) {
  // Read the token from the cookie (manually parsed).
  let token = readCookie(req, config.csrf.cookieName);

  // Issue a fresh token if none exists (safe methods + first visit).
  if (!token) token = issueToken(res);

  req.csrfToken = token;

  // Safe methods: no verification needed.
  if (SAFE_METHODS.has(req.method)) return next();

  // Unsafe methods: require a matching token from header, body, or query.
  const fromHeader = req.get(config.csrf.headerName);
  const fromBody = req.body && req.body[config.csrf.fieldName];
  const fromQuery = req.query && req.query[config.csrf.fieldName];
  const provided = fromHeader || fromBody || fromQuery;

  if (!provided) {
    return next(new HttpError(403, 'Missing CSRF token'));
  }

  const [raw] = String(provided).split('.');
  const cookieRaw = String(token).split('.')[0];

  if (cookieRaw !== raw) {
    return next(new HttpError(403, 'CSRF token mismatch'));
  }
  if (!verify(raw, String(provided))) {
    return next(new HttpError(403, 'Invalid CSRF token'));
  }

  next();
}

module.exports = { csrfProtection, issueToken };