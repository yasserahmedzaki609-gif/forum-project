// ============================================================================
// src/controllers/posts.controller.js — Posts + F06 (edit, delete, notifications)
// ============================================================================

const postModel = require('../models/post.model');
const categoryModel = require('../models/category.model');
const reactionModel = require('../models/reaction.model');
const notificationModel = require('../models/notification.model');
const activityModel = require('../models/activity.model');
const { HttpError } = require('../middleware/errorHandler');
const config = require('../config');

// ---------------------------------------------------------------------------
// GET /api/posts
// ---------------------------------------------------------------------------
function listPosts(req, res, next) {
  try {
    const { category, filter, page, pageSize } = req.query;

    const limit = Math.min(
      parseInt(pageSize, 10) || config.pagination.defaultSize,
      config.pagination.maxSize
    );
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (pageNum - 1) * limit;

    const userId = req.user ? req.user.id : null;

    if ((filter === 'my_posts' || filter === 'my_likes') && !userId) {
      throw new HttpError(401, 'Login required for this filter');
    }

    if (category && !categoryModel.findByName(category)) {
      throw new HttpError(404, 'Category not found');
    }

    const { rows, total } = postModel.list({
      category,
      filter,
      userId,
      limit,
      offset,
    });

    res.json({
      data: rows.map((r) => ({
        ...r,
        categories: r.categories ? r.categories.split(',') : [],
      })),
      pagination: { page: pageNum, pageSize: limit, total },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/posts/:postId
// ---------------------------------------------------------------------------
function getPost(req, res, next) {
  try {
    const postId = parseInt(req.params.postId, 10);
    if (!Number.isInteger(postId) || postId <= 0) {
      throw new HttpError(400, 'Invalid post id');
    }

    const post = postModel.findByIdAggregated(postId);
    if (!post) throw new HttpError(404, 'Post not found');

    const isOwner = req.user && req.user.id === post.user_id;
    const isMod = req.user && (req.user.role === 'moderator' || req.user.role === 'admin');

    // Security: Hide pending posts from unauthorized users by returning 404
    if (post.status !== 'approved' && !isOwner && !isMod) {
      throw new HttpError(404, 'Post not found');
    }

    res.json({
      ...post,
      categories: post.categories ? post.categories.split(',') : [],
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/posts
// ---------------------------------------------------------------------------
function createPost(req, res, next) {
  try {
    const { title, content, categoryIds } = req.body;

    const allCategories = categoryModel.all();
    const knownIds = new Set(allCategories.map((c) => c.id));
    for (const id of categoryIds) {
      if (!knownIds.has(id)) {
        throw new HttpError(400, `Unknown category id: ${id}`);
      }
    }

    const postId = postModel.create(
      req.user.id,
      title.trim(),
      content.trim(),
      categoryIds
    );

    // F06: Log activity
    activityModel.log(req.user.id, 'post_create', 'post', postId);

    res.status(201).json({ id: postId });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PUT /api/posts/:postId — F06 Edit (with optimistic locking)
// ---------------------------------------------------------------------------
function updatePost(req, res, next) {
  try {
    const postId = parseInt(req.params.postId, 10);
    if (!Number.isInteger(postId) || postId <= 0) {
      throw new HttpError(400, 'Invalid post id');
    }

    const post = postModel.findById(postId);
    if (!post) throw new HttpError(404, 'Post not found');
    if (post.user_id !== req.user.id) {
      throw new HttpError(403, 'You can only edit your own posts');
    }

    const { title, content, categoryIds, updatedAt } = req.body;

    const ok = postModel.update(
      postId,
      req.user.id,
      title.trim(),
      content.trim(),
      categoryIds,
      updatedAt
    );

    if (!ok) {
      throw new HttpError(409, 'Post was modified by someone else. Please reload.');
    }

    // F06: Log activity
    activityModel.log(req.user.id, 'post_edit', 'post', postId);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/posts/:postId — F06 Delete
// ---------------------------------------------------------------------------
function deletePost(req, res, next) {
  try {
    const postId = parseInt(req.params.postId, 10);
    if (!Number.isInteger(postId) || postId <= 0) {
      throw new HttpError(400, 'Invalid post id');
    }

    const post = postModel.findById(postId);
    if (!post) throw new HttpError(404, 'Post not found');
    if (post.user_id !== req.user.id && req.user.role !== 'admin') {
      throw new HttpError(403, 'You can only delete your own posts');
    }

    const ok = postModel.delete(postId, post.user_id);
    if (!ok) throw new HttpError(500, 'Failed to delete post');

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/posts/:postId/like | /dislike
// ---------------------------------------------------------------------------
function reactToPost(req, res, next) {
  try {
    const postId = parseInt(req.params.postId, 10);
    if (!Number.isInteger(postId) || postId <= 0) {
      throw new HttpError(400, 'Invalid post id');
    }

    const post = postModel.findById(postId);
    if (!post) throw new HttpError(404, 'Post not found');

    const value = req.reactionValue;
    if (value !== 1 && value !== -1) {
      throw new HttpError(400, 'Invalid reaction action');
    }

    const result = reactionModel.react(req.user.id, 'post', postId, value);

    // F06: Notify post owner on like (not on dislike, not on self-like)
    if (result.action === 'added' && value === 1 && post.user_id !== req.user.id) {
      notificationModel.create(post.user_id, req.user.id, 'like', 'post', postId);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPosts,
  getPost,            
  createPost,
  updatePost,
  deletePost,
  reactToPost,
};