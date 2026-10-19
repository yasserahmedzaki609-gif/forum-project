// ============================================================================
// src/models/category.model.js — Categories lookup (F05: with create)
// ============================================================================

const db = require('../database/db');

const stmtAll = db.prepare('SELECT id, name FROM categories ORDER BY name');
const stmtByName = db.prepare('SELECT id, name FROM categories WHERE name = ?');
const stmtById = db.prepare('SELECT id, name FROM categories WHERE id = ?');
const stmtInsert = db.prepare('INSERT INTO categories (name) VALUES (?)');

module.exports = {
  all: () => stmtAll.all(),
  findByName: (name) => stmtByName.get(name),
  findById: (id) => stmtById.get(id),
  create: (name) => {
    const info = stmtInsert.run(name);
    return { id: info.lastInsertRowid, name };
  },
};