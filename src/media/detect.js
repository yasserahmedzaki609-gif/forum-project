// ============================================================================
// src/media/detect.js — Magic-byte detection (no external dependency)
// ============================================================================

const { detectImageType } = require('../utils/imageType');
const { HttpError } = require('../middleware/errorHandler');

async function detectImageTypeStrict(buffer) {
  const type = detectImageType(buffer);
  if (!type) {
    throw new HttpError(415, 'Unsupported file type. Allowed: JPEG, PNG, WebP, GIF.');
  }
  return type;
}

module.exports = { detectImageType: detectImageTypeStrict };