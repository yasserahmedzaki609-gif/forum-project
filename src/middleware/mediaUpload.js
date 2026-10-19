// ============================================================================
// src/middleware/mediaUpload.js — Content-Type guard for upload routes
// ----------------------------------------------------------------------------
// Ensures the request is multipart/form-data before we reach the controller.
// Actual parsing is done by busboy inside src/media/upload.js.
//
// We don't use express.json() here — multipart bodies bypass it.
// ============================================================================

function mediaUploadGuard(req, res, next) {
  const ct = req.get('content-type') || '';
  if (!ct.startsWith('multipart/form-data')) {
    return res.status(415).json({ error: 'Expected multipart/form-data' });
  }
  next();
}

module.exports = { mediaUploadGuard };