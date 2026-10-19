// ============================================================================
// src/routes/media.routes.js — F04 media routes with user-based limiter
// ============================================================================

const express = require('express');
const router = express.Router();

const mediaCtrl = require('../controllers/media.controller');
const { requireAuth } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimit');
const { mediaUploadGuard } = require('../middleware/mediaUpload');

// Serve a stored file (public read access)
router.get('/api/media/:id', mediaCtrl.serveMedia);

// List media attached to a post (public)
router.get('/api/posts/:postId/media', mediaCtrl.listPostMedia);

// Upload media to a post (auth + user-based rate limit + content-type guard)
router.post(
  '/api/posts/:postId/media',
  requireAuth,
  uploadLimiter,
  mediaUploadGuard,
  mediaCtrl.uploadPostMedia
);

// Delete media (auth, owner only)
router.delete('/api/media/:id', requireAuth, mediaCtrl.deleteMedia);

module.exports = router;