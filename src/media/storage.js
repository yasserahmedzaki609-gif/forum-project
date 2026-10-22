// ============================================================================
// src/media/storage.js — Atomic storage with SHA-256 addressing
// ----------------------------------------------------------------------------
// Storage path format: <root>/<ab>/<cd>/<sha256>.<ext>
//
//   - `ab` and `cd` are the first 4 hex chars of the hash (directory sharding).
//   - The final filename is the full SHA-256 in hex.
//   - The extension comes from the re-encoded output, NOT from user input.
//
// Properties:
//   - Deduplication: identical bytes always produce the same path.
//   - Atomic write: temp file + rename.
//   - Idempotent: if the file already exists, we reuse it.
//   - Path traversal impossible: paths are hex-only + resolveAbsolute guard.
// ============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const config = require('../config');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// SHA-256 of a buffer
// ---------------------------------------------------------------------------
function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ---------------------------------------------------------------------------
// Build the relative path from a hash and extension
// ---------------------------------------------------------------------------
function buildRelativePath(hash, ext) {
  const ab = hash.slice(0, 2);
  const cd = hash.slice(2, 4);
  return path.join(ab, cd, `${hash}.${ext}`);
}

// ---------------------------------------------------------------------------
// Ensure a directory exists (recursive)
// ---------------------------------------------------------------------------
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Store a buffer, returning the relative path and hash
// ---------------------------------------------------------------------------
async function storeBuffer(buffer, ext) {
  const hash = sha256(buffer);
  const relative = buildRelativePath(hash, ext);
  const absolute = path.join(config.media.root, relative);

  ensureDir(path.dirname(absolute));

  // Idempotent: if same bytes already stored, reuse.
  if (fs.existsSync(absolute)) {
    return { relativePath: relative, absolutePath: absolute, sha256: hash };
  }

  // Atomic write: write to a temp file, then rename.
  const tmp = `${absolute}.tmp.${process.pid}.${Date.now()}`;
  await fs.promises.writeFile(tmp, buffer, { flag: 'wx' });
  await fs.promises.rename(tmp, absolute);

  logger.info(`Stored media: ${relative} (${buffer.length} bytes)`);

  return { relativePath: relative, absolutePath: absolute, sha256: hash };
}

// ---------------------------------------------------------------------------
// Resolve a relative path to an absolute one, guarding against traversal
// ---------------------------------------------------------------------------
function resolveAbsolute(relativePath) {
  const absolute = path.resolve(config.media.root, relativePath);
  const root = path.resolve(config.media.root);

  if (!absolute.startsWith(root + path.sep)) {
    throw new Error('Refusing to resolve path outside media root');
  }

  return absolute;
}

// ---------------------------------------------------------------------------
// Delete a stored file (ENOENT tolerated)
// ---------------------------------------------------------------------------
async function deleteFile(relativePath) {
  const absolute = resolveAbsolute(relativePath);
  try {
    await fs.promises.unlink(absolute);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

module.exports = { storeBuffer, resolveAbsolute, deleteFile, sha256 };