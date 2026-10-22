// ============================================================================
// src/media/index.js — Unified media pipeline entry point
// ----------------------------------------------------------------------------
// Runs all four stages in order:
//   1. Streaming intake (busboy)
//   2. Magic-byte detection (file-type)
//   3. Decode + re-encode (sharp)
//   4. Atomic storage (SHA-256)
//
// Returns a plain object suitable for inserting into the media table.
// ============================================================================

const { intakeMultipart } = require('./upload');
const { detectImageType } = require('./detect');
const { processImage } = require('./process');
const { storeBuffer } = require('./storage');

async function handleUpload(req) {
  // 1. Stream + bound
  const { buffer, originalName, declaredMime, fields } =
    await intakeMultipart(req);

  // 2. Magic bytes (rejects non-image, SVG, etc.)
  await detectImageType(buffer);

  // 3. Decode + re-encode (strips EXIF, destroys polyglots)
  const processed = await processImage(buffer);

  // 4. Store (atomic, SHA-256-addressed)
  const stored = await storeBuffer(processed.buffer, processed.ext);

  return {
    originalName,
    declaredMime,
    fields,
    mime: processed.mime,
    width: processed.width,
    height: processed.height,
    sizeBytes: processed.sizeBytes,
    storagePath: stored.relativePath,
    sha256: stored.sha256,
  };
}

module.exports = { handleUpload };