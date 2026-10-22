// ============================================================================
// src/media/upload.js — Streaming multipart intake (busboy)
// ----------------------------------------------------------------------------
// Hard bounds enforced during streaming:
//   - Total bytes (config.media.maxFileBytes, default 5 MB)
//   - Number of files (1)
//   - Number of fields (5)
//   - Number of parts (10)
//   - Field name size (100 bytes)
//   - Field value size (1024 bytes)
//
// The stream is DRAINED (not aborted) when a limit is exceeded, to avoid
// connection resets that could be exploited.
//
// Returns a Promise that resolves with { buffer, originalName, declaredMime, fields }
// or rejects with an HttpError.
// ============================================================================

const Busboy = require('busboy');

const config = require('../config');
const { HttpError } = require('../middleware/errorHandler');

function intakeMultipart(req) {
  return new Promise((resolve, reject) => {
    let bb;

    try {
      bb = Busboy({
        headers: req.headers,
        limits: {
          fileSize: config.media.maxFileBytes,
          files: 1,
          fields: 5,
          parts: 10,
          fieldNameSize: 100,
          fieldSize: 1024,
        },
      });
    } catch (_err) {
      return reject(new HttpError(400, 'Invalid multipart request'));
    }

    const fields = {};
    const chunks = [];
    let totalBytes = 0;
    let fileBuffer = null;
    let originalName = null;
    let declaredMime = null;
    let truncated = false;
    let fileSeen = false;

    bb.on('field', (name, value) => {
      fields[name] = value;
    });

    bb.on('file', (name, stream, info) => {
      if (fileSeen) {
        stream.resume();
        return reject(new HttpError(400, 'Only one file is allowed'));
      }

      fileSeen = true;
      originalName = info.filename || 'unnamed';
      declaredMime = info.mimeType || 'application/octet-stream';

      stream.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > config.media.maxFileBytes) {
          truncated = true;
          stream.resume(); // drain
          return;
        }
        chunks.push(chunk);
      });

      stream.on('limit', () => {
        truncated = true;
      });

      stream.on('end', () => {
        if (truncated) return;
        fileBuffer = Buffer.concat(chunks, totalBytes);
      });

      stream.on('error', (err) =>
        reject(new HttpError(400, `Upload stream error: ${err.message}`))
      );
    });

    bb.on('filesLimit', () => reject(new HttpError(400, 'Too many files')));
    bb.on('fieldsLimit', () => reject(new HttpError(400, 'Too many fields')));
    bb.on('partsLimit', () => reject(new HttpError(400, 'Too many parts')));

    bb.on('error', (err) =>
      reject(new HttpError(400, `Multipart error: ${err.message}`))
    );

    bb.on('close', () => {
      if (truncated) return reject(new HttpError(413, 'File too large'));
      if (!fileBuffer) return reject(new HttpError(400, 'No file provided'));

      resolve({
        buffer: fileBuffer,
        originalName,
        declaredMime,
        fields,
      });
    });

    req.pipe(bb);
  });
}

module.exports = { intakeMultipart };