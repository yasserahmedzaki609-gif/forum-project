// ============================================================================
// src/controllers/categories.controller.js — Categories list (public)
// ============================================================================

const categoryModel = require('../models/category.model');

function listCategories(req, res, next) {
  try {
    res.json(categoryModel.all());
  } catch (err) {
    next(err);
  }
}

module.exports = { listCategories };
