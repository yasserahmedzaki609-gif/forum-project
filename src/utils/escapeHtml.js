// ============================================================================
// src/utils/escapeHtml.js — HTML escaping (defense against XSS)
// ----------------------------------------------------------------------------
// Use whenever user-controlled data is inserted into HTML.
// Frontend has its own copy in public/script.js.
// ============================================================================

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;');
}

module.exports = { escapeHtml };