// ============================================================================
// src/routes/index.js — All routes (F01–F06 + C3 + C4)
// ============================================================================

const express = require('express');
const router = express.Router();

const authCtrl = require('../controllers/auth.controller');
const postsCtrl = require('../controllers/posts.controller');
const commentsCtrl = require('../controllers/comments.controller');
const categoriesCtrl = require('../controllers/categories.controller');
const notificationsCtrl = require('../controllers/notifications.controller');
const activityCtrl = require('../controllers/activity.controller');
const identitiesCtrl = require('../controllers/identities.controller'); // ← جديد (C3)

const { validateRegister, validateLogin, validateChangePassword } = require('../validators/auth.validator');
const { validateCreatePost, validateUpdatePost } = require('../validators/post.validator');
const { validateCreateComment, validateUpdateComment } = require('../validators/comment.validator');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const {
  authLimiter,
  loginLimiter,
  postCreateLimiter,
  commentCreateLimiter,
  reactionLimiter,
} = require('../middleware/rateLimit');

// Reaction middleware
const setLike = (req, res, next) => { req.reactionValue = 1; next(); };
const setDislike = (req, res, next) => { req.reactionValue = -1; next(); };

// ===========================================================================
// Auth
// ===========================================================================
router.post('/register', authLimiter, validate(validateRegister), authCtrl.register);
router.post('/login', loginLimiter, validate(validateLogin), authCtrl.login);
router.post('/logout', requireAuth, authCtrl.logout);
router.get('/me', authCtrl.me);
router.post('/api/users/me/password', requireAuth, authLimiter, validate(validateChangePassword), authCtrl.changePassword);

// C4: Account deletion (requires password or username confirmation)
router.delete('/api/users/me', requireAuth, authCtrl.deleteAccount);

// ===========================================================================
// Categories
// ===========================================================================
router.get('/api/categories', categoriesCtrl.listCategories);

// ===========================================================================
// Posts
// ===========================================================================
router.get('/api/posts', postsCtrl.listPosts);
router.get('/api/posts/:postId', postsCtrl.getPost);  
router.post('/api/posts', requireAuth, postCreateLimiter, validate(validateCreatePost), postsCtrl.createPost);

// F06: Edit + Delete
router.put('/api/posts/:postId', requireAuth, validate(validateUpdatePost), postsCtrl.updatePost);
router.delete('/api/posts/:postId', requireAuth, postsCtrl.deletePost);

// Reactions
router.post('/api/posts/:postId/like', requireAuth, reactionLimiter, setLike, postsCtrl.reactToPost);
router.post('/api/posts/:postId/dislike', requireAuth, reactionLimiter, setDislike, postsCtrl.reactToPost);

// ===========================================================================
// Comments
// ===========================================================================
router.get('/api/posts/:postId/comments', commentsCtrl.listComments);
router.post('/api/posts/:postId/comments', requireAuth, commentCreateLimiter, validate(validateCreateComment), commentsCtrl.createComment);

// F06: Edit + Delete
router.put('/api/comments/:commentId', requireAuth, validate(validateUpdateComment), commentsCtrl.updateComment);
router.delete('/api/comments/:commentId', requireAuth, commentsCtrl.deleteComment);

// Reactions
router.post('/api/comments/:commentId/like', requireAuth, reactionLimiter, setLike, commentsCtrl.reactToComment);
router.post('/api/comments/:commentId/dislike', requireAuth, reactionLimiter, setDislike, commentsCtrl.reactToComment);

// ===========================================================================
// Notifications (F06)
// ===========================================================================
router.get('/api/notifications', requireAuth, notificationsCtrl.listNotifications);
router.patch('/api/notifications/:id/read', requireAuth, notificationsCtrl.markRead);

// ===========================================================================
// Activity (F06)
// ===========================================================================
router.get('/api/activity/me', requireAuth, activityCtrl.listMyActivity);

// ===========================================================================
// C3: Identity management
// ===========================================================================
router.get('/api/users/me/identities', requireAuth, identitiesCtrl.listMyIdentities);
router.delete('/api/users/me/identities/:provider', requireAuth, identitiesCtrl.unlinkIdentity);

// ===========================================================================
// SSO (F02)
// ===========================================================================
const ssoRoutes = require('./sso.routes');
router.use(ssoRoutes);

// ===========================================================================
// Media (F03)
// ===========================================================================
const mediaRoutes = require('./media.routes');
router.use(mediaRoutes);

// ===========================================================================
// Moderation (F05 & P23 & C1 & D3)
// ===========================================================================
const moderationRoutes = require('./moderation.routes');
router.use(moderationRoutes);

module.exports = router;