// ============================================================================
// src/controllers/media.controller.js — Media upload / serve / delete / list
// ----------------------------------------------------------------------------
// Upload flow:
//   1. Verify auth + post ownership + quota.
//   2. Run src/media/index.js::handleUpload(req) → full pipeline.
//   3. Insert DB row, respond with public URL.
//
// Serve flow:
//   - Public, streams file with server-computed MIME and nosniff header.
//   - Content-Disposition: inline with sanitized filename (numeric id).
//
// Delete flow:
//   - Owner only. Deletes DB row + file (ENOENT tolerated).
// ============================================================================

const fs = require('fs');

const { handleUpload } = require('../media');
const { resolveAbsolute, deleteFile } = require('../media/storage');
const mediaModel = require('../models/media.model');
const postModel = require('../models/post.model');
const config = require('../config');
const { HttpError } = require('../middleware/errorHandler');

// ---------------------------------------------------------------------------
// POST /api/posts/:postId/media  (auth + owner of post)
// ---------------------------------------------------------------------------
async function uploadPostMedia(req, res, next) {
  try {
    const postId = parseInt(req.params.postId, 10);
    if (!Number.isInteger(postId) || postId <= 0) {
      throw new HttpError(400, 'Invalid post id');
    }

    const post = postModel.findById(postId);
    if (!post) throw new HttpError(404, 'Post not found');
    if (post.user_id !== req.user.id) {
      throw new HttpError(403, 'You can only attach media to your own posts');
    }

    // Per-user quota check before consuming upload resources.
    const count = mediaModel.countForUser(req.user.id);
    if (count >= config.media.maxPerUser) {
      throw new HttpError(429, 'Media quota exceeded');
    }

    // Full pipeline: streaming → magic bytes → re-encode → store.
    const result = await handleUpload(req);

    const media = mediaModel.create({
      userId: req.user.id,
      postId,
      kind: 'post_image',
      originalName: result.originalName,
      mimeType: result.mime,
      sizeBytes: result.sizeBytes,
      width: result.width,
      height: result.height,
      storagePath: result.storagePath,
      sha256: result.sha256,
    });

    res.status(201).json({
      id: media.id,
      url: `/api/media/${media.id}`,
      width: media.width,
      height: media.height,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/media/:id  (public read access)
// ---------------------------------------------------------------------------
function serveMedia(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, 'Invalid media id');
    }

    const media = mediaModel.findById(id);
    if (!media) throw new HttpError(404, 'Media not found');

    const absolute = resolveAbsolute(media.storage_path);
    if (!fs.existsSync(absolute)) {
      throw new HttpError(404, 'Media file missing');
    }

    // Server-computed MIME; never trust the client.
    res.setHeader('Content-Type', media.mime_type);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${media.id}.${media.mime_type.split('/')[1]}"`
    );

    fs.createReadStream(absolute).pipe(res);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/media/:id  (auth + owner)
// ---------------------------------------------------------------------------
async function deleteMedia(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, 'Invalid media id');
    }

    const media = mediaModel.findById(id);
    if (!media) throw new HttpError(404, 'Media not found');
    if (media.user_id !== req.user.id) {
      throw new HttpError(403, 'You can only delete your own media');
    }

    // DB first, then file. If file deletion fails (ENOENT), it's tolerated.
    mediaModel.deleteById(id);
    await deleteFile(media.storage_path);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/posts/:postId/media  (public list of a post's media)
// ---------------------------------------------------------------------------
function listPostMedia(req, res, next) {
  try {
    const postId = parseInt(req.params.postId, 10);
    if (!Number.isInteger(postId) || postId <= 0) {
      throw new HttpError(400, 'Invalid post id');
    }

    const rows = mediaModel.listForPost(postId);

    res.json(
      rows.map((m) => ({
        id: m.id,
        url: `/api/media/${m.id}`,
        width: m.width,
        height: m.height,
      }))
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadPostMedia,
  serveMedia,
  deleteMedia,
  listPostMedia,
};
