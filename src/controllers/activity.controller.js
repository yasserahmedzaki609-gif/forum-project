// ============================================================================
// src/controllers/activity.controller.js — F06
// ============================================================================

const activityModel = require('../models/activity.model');

// GET /api/activity/me
function listMyActivity(req, res, next) {
  try {
    const items = activityModel.listForUser(req.user.id);
    res.json(items);
  } catch (err) {
    next(err);
  }
}

module.exports = { listMyActivity };