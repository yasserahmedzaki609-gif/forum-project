// ============================================================================
// scripts/cleanup-media.js — Remove orphan media files
// ----------------------------------------------------------------------------
// An "orphan" is a file on disk that has no corresponding row in the media
// table. This can happen if the DB row was deleted without the file, or if a
// crash interrupted the two-step delete.
//
// Usage: npm run media:cleanup
// ============================================================================

const fs = require('fs');
const path = require('path');

const db = require('../src/database/db');
const config = require('../src/config');
const logger = require('../src/utils/logger');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && !entry.name.endsWith('.tmp')) {
      out.push(full);
    }
  }

  return out;
}

function cleanup() {
  const root = path.resolve(config.media.root);

  if (!fs.existsSync(root)) {
    console.log(`Media root does not exist: ${root}`);
    return;
  }

  const known = new Set(
    db
      .prepare('SELECT storage_path FROM media')
      .all()
      .map((r) => path.resolve(root, r.storage_path))
  );

  let removed = 0;
  let kept = 0;

  for (const full of walk(root)) {
    if (known.has(full)) {
      kept++;
    } else {
      try {
        fs.unlinkSync(full);
        logger.info(`Removed orphan: ${full}`);
        removed++;
      } catch (err) {
        logger.error(`Failed to remove: ${full}`, err);
      }
    }
  }

  console.log('');
  console.log(`Media root: ${root}`);
  console.log(`Files kept:   ${kept}`);
  console.log(`Files removed: ${removed}`);
}

cleanup();