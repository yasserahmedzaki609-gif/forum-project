// ============================================================================
// src/config/index.js — Environment loading and validation
// ============================================================================

require('dotenv').config();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name, fallback) {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

function int(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Env var ${name} must be an integer`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const NODE_ENV = optional('NODE_ENV', 'development');
const isProd = NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

const sessionSecret = required('SESSION_SECRET');
if (sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters long');
}

const csrfSecret = required('CSRF_SECRET');
if (csrfSecret.length < 32) {
  throw new Error('CSRF_SECRET must be at least 32 characters long');
}

// ---------------------------------------------------------------------------
// Database password (P21 — optional encryption)
// ---------------------------------------------------------------------------
// In production, if set, MUST be at least 16 chars. In development, optional.
//
// F04-FIX (G1+): Tests always use :memory:, and SQLCipher refuses to apply
// a key to in-memory databases. We FORCE dbPassword to empty in test mode,
// regardless of what .env or the shell contains. This makes tests portable
// across developer machines and CI, and prevents the whole test suite from
// failing when a developer has DB_PASSWORD set for local P21 experiments.
// ---------------------------------------------------------------------------
const isTest = NODE_ENV === 'test';
const dbPassword = isTest ? '' : optional('DB_PASSWORD', '');

if (isProd && dbPassword && dbPassword.length < 16) {
  throw new Error('DB_PASSWORD must be at least 16 characters in production');
}

// ---------------------------------------------------------------------------
// Config object
// ---------------------------------------------------------------------------

const config = {
  env: NODE_ENV,
  isProd,

  server: {
    port: int('PORT', 3000),
    host: optional('HOST', 'localhost'),
  },

  session: {
    name: 'forum_session',
    keys: [sessionSecret],
    maxAgeMs: int('SESSION_MAX_AGE_HOURS', 24) * 60 * 60 * 1000,
    secure: isProd,
    httpOnly: true,
    sameSite: 'lax',
    idleTimeoutMs: int('SESSION_IDLE_TIMEOUT_MIN', 120) * 60 * 1000,
    absoluteTimeoutMs: int('SESSION_ABSOLUTE_TIMEOUT_DAYS', 7) * 24 * 60 * 60 * 1000,
    bindToUserAgent: optional('SESSION_BIND_UA', 'true') === 'true',
  },

  csrf: {
    secret: csrfSecret,
    cookieName: 'csrf_token',
    headerName: 'x-csrf-token',
    fieldName: '_csrf',
  },

  // --- P21: Database (path + optional SQLCipher password) ---
  db: {
    path: isProd
      ? optional('DB_PATH', '/app/data/forum.db')
      : optional('DB_PATH', './data/forum.db'),
    password: dbPassword,
  },

  tls: {
    certPath: isProd ? '/app/certs/cert.pem' : optional('CERT_PATH', './certs/cert.pem'),
    keyPath: isProd ? '/app/certs/key.pem' : optional('KEY_PATH', './certs/key.pem'),
    days: int('CERT_DAYS', 365),
    commonName: optional('CERT_CN', 'localhost'),
    country: optional('CERT_C', 'EG'),
    state: optional('CERT_ST', 'Cairo'),
    locality: optional('CERT_L', 'Cairo'),
    org: optional('CERT_O', 'Forum'),
  },

  rateLimit: {
    windowMs: int('RATE_LIMIT_WINDOW_MIN', 15) * 60 * 1000,
    max: int('RATE_LIMIT_MAX', 100),
    authMax: int('AUTH_RATE_LIMIT_MAX', 50),
  },

  body: {
    limit: optional('BODY_LIMIT', '10kb'),
  },

  pagination: {
    defaultSize: int('DEFAULT_PAGE_SIZE', 10),
    maxSize: int('MAX_PAGE_SIZE', 50),
  },

  sso: {
    appBaseUrl: optional('APP_BASE_URL', 'https://localhost:3000'),
    stateTtlMs: int('OAUTH_STATE_TTL_SECONDS', 600) * 1000,
    google: {
      enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      clientId: optional('GOOGLE_CLIENT_ID', ''),
      clientSecret: optional('GOOGLE_CLIENT_SECRET', ''),
      redirectUri: optional('GOOGLE_REDIRECT_URI', 'https://localhost:3000/auth/google/callback'),
      issuerUrl: 'https://accounts.google.com',
    },
    github: {
      enabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      clientId: optional('GITHUB_CLIENT_ID', ''),
      clientSecret: optional('GITHUB_CLIENT_SECRET', ''),
      redirectUri: optional('GITHUB_REDIRECT_URI', 'https://localhost:3000/auth/github/callback'),
      authorizationEndpoint: 'https://github.com/login/oauth/authorize',
      tokenEndpoint: 'https://github.com/login/oauth/access_token',
      userInfoEndpoint: 'https://api.github.com/user',
      emailsEndpoint: 'https://api.github.com/user/emails',
      scope: 'read:user user:email',
    },
  },

  media: {
    root: isProd ? optional('MEDIA_ROOT', '/app/media') : optional('MEDIA_ROOT', './media'),
    maxFileBytes: int('MEDIA_MAX_FILE_BYTES', 5 * 1024 * 1024),
    maxWidth: int('MEDIA_MAX_WIDTH', 4000),
    maxHeight: int('MEDIA_MAX_HEIGHT', 4000),
    outputFormat: optional('MEDIA_OUTPUT_FORMAT', 'webp'),
    outputQuality: int('MEDIA_OUTPUT_QUALITY', 85),
    resizeMaxWidth: int('MEDIA_RESIZE_MAX_WIDTH', 1920),
    resizeMaxHeight: int('MEDIA_RESIZE_MAX_HEIGHT', 1920),
    maxPerUser: int('MEDIA_MAX_PER_USER', 200),
  },
};

module.exports = config;