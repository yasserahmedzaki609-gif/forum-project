// ============================================================================
// src/utils/logger.js — Minimal structured logger
// ----------------------------------------------------------------------------
// Writes to stdout/stderr. No secrets, tokens, or request bodies logged.
// Container-friendly (Docker captures stdout/stderr).
// ============================================================================

const config = require('../config');

function ts() {
  return new Date().toISOString();
}

function log(level, msg, meta) {
  const line = `[${ts()}] [${level}] ${msg}`;
  const out = level === 'error' ? 'error' : 'log';

  if (meta !== undefined) {
    console[out](line, meta);
  } else {
    console[out](line);
  }
}

module.exports = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};
