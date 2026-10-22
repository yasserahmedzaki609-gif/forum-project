// ============================================================================
// src/utils/imageType.js — Magic-byte detection for allowed image formats
// ----------------------------------------------------------------------------
// Replaces file-type@16 (CVE-2026-31808: infinite loop in ASF parser).
//
// We only accept JPEG, PNG, WebP, GIF. Detection is a simple magic-byte
// check on the first 12 bytes — no parser, no infinite loop possible.
// ============================================================================

const TYPES = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  png: { mime: 'image/png', ext: 'png' },
  webp: { mime: 'image/webp', ext: 'webp' },
  gif: { mime: 'image/gif', ext: 'gif' },
};

/**
 * @param {Buffer} buf
 * @returns {{ mime: string, ext: string } | null}
 */
function detectImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return TYPES.jpeg;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return TYPES.png;
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buf.slice(0, 4).toString('ascii') === 'RIFF' &&
    buf.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return TYPES.webp;
  }

  // GIF: "GIF87a" or "GIF89a"
  const gifHeader = buf.slice(0, 6).toString('ascii');
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
    return TYPES.gif;
  }

  return null;
}

module.exports = { detectImageType };