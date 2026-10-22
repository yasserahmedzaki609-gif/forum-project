// ============================================================================
// src/media/process.js — Decode + re-encode with sharp
// ----------------------------------------------------------------------------
// This is the security-critical step of the media pipeline.
//
// Why re-encode?
//   sharp decodes the image to raw pixel data and re-encodes it into a
//   brand-new file. Any appended bytes, polyglot payloads, or malicious EXIF
//   data are destroyed in the process.
//
// Order of operations:
//   1. Read metadata (dimensions) BEFORE full decode → decompression bomb guard
//   2. Reject if dimensions exceed config.media.max{Width,Height}
//   3. sharp.rotate() → applies EXIF rotation, then strips EXIF
//   4. resize() with `withoutEnlargement: true` → downscale only
//   5. Encode to WebP (or JPEG) at configurable quality
// ============================================================================

const sharp = require('sharp');

const config = require('../config');
const { HttpError } = require('../middleware/errorHandler');

async function processImage(buffer) {
  // -------------------------------------------------------------------------
  // 1. Read metadata (no full decode yet)
  // -------------------------------------------------------------------------
  let meta;
  try {
    meta = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: false,
    }).metadata();
  } catch (_err) {
    throw new HttpError(400, 'Invalid or corrupted image');
  }

  if (!meta || !meta.width || !meta.height) {
    throw new HttpError(400, 'Image has no readable dimensions');
  }

  // -------------------------------------------------------------------------
  // 2. Dimension guard (before decoding pixels)
  // -------------------------------------------------------------------------
  if (
    meta.width > config.media.maxWidth ||
    meta.height > config.media.maxHeight
  ) {
    throw new HttpError(
      413,
      `Image too large. Max ${config.media.maxWidth}x${config.media.maxHeight}.`
    );
  }

  // -------------------------------------------------------------------------
  // 3. Build the pipeline
  // -------------------------------------------------------------------------
  const pipeline = sharp(buffer, { failOn: 'error' })
    .rotate()
    .resize({
      width: config.media.resizeMaxWidth,
      height: config.media.resizeMaxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    });

  // -------------------------------------------------------------------------
  // 4. Encode
  // -------------------------------------------------------------------------
  let outputBuffer;
  let outputMime;

  if (config.media.outputFormat === 'jpeg') {
    outputBuffer = await pipeline
      .jpeg({ quality: config.media.outputQuality, mozjpeg: true })
      .toBuffer();
    outputMime = 'image/jpeg';
  } else {
    outputBuffer = await pipeline
      .webp({ quality: config.media.outputQuality })
      .toBuffer();
    outputMime = 'image/webp';
  }

  // -------------------------------------------------------------------------
  // 5. Read final dimensions
  // -------------------------------------------------------------------------
  const finalMeta = await sharp(outputBuffer).metadata();

  return {
    buffer: outputBuffer,
    mime: outputMime,
    ext: config.media.outputFormat === 'jpeg' ? 'jpg' : 'webp',
    width: finalMeta.width,
    height: finalMeta.height,
    sizeBytes: outputBuffer.length,
  };
}

module.exports = { processImage };