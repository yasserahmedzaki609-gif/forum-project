// ============================================================================
// src/controllers/notifications.controller.js — F06
// ============================================================================

const notificationModel = require('../models/notification.model');
const { HttpError } = require('../middleware/errorHandler');

// GET /api/notifications
function listNotifications(req, res, next) {
  try {
    const items = notificationModel.listForUser(req.user.id);
    res.json(items);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/notifications/:id/read
function markRead(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, 'Invalid notification id');
    }

    const ok = notificationModel.markRead(id, req.user.id);
    if (!ok) throw new HttpError(404, 'Notification not found');

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listNotifications, markRead };