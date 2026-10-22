#!/usr/bin/env node
// ============================================================================
// scripts/index-observatory.js — P26: Index Observatory
// ----------------------------------------------------------------------------
// Runs EXPLAIN QUERY PLAN against every critical query in the app and prints
// a report:
//   ✅ uses an index (or covering index / primary key)
//   ⚠️  full table SCAN — potential candidate for a new index
//
// Usage:
//   npm run db:observatory           human-readable report
//   npm run db:observatory -- --json  machine-readable (for CI / diffs)
//
// Exit code:
//   0 — all queries use an index OR full scans are on small expected tables
//   1 — at least one critical query scans without USING clause
//
// Notes:
//   - Runs against the *current* DB (./data/forum.db by default, or DB_PATH).
//   - Does NOT modify the DB. Read-only inspection.
//   - Safe to run in production (read-only EXPLAIN; no writes).
// ============================================================================

const config = require('../src/config');
const db = require('../src/database/db');

// ---------------------------------------------------------------------------
// Critical queries — every hot path in the app should be represented here
// ---------------------------------------------------------------------------
// name:        short identifier for the report
// sql:         the query as it runs in production
// allowed:     'index' if a full scan is a regression; 'scan_ok' if the table
//              is small enough that scanning is acceptable (e.g. categories,
//              schema_migrations)
// ---------------------------------------------------------------------------
const QUERIES = [
  {
    name: 'posts.feed',
    sql: `
      SELECT id, title, content, created_at, updated_at, user_id, status
      FROM posts
      WHERE status = 'approved'
      ORDER BY created_at DESC
      LIMIT 10
    `,
    allowed: 'index',
  },
  {
    name: 'posts.feed_by_category',
    sql: `
      SELECT p.id
      FROM posts p
      JOIN post_categories pc ON pc.post_id = p.id
      WHERE pc.category_id = 1 AND p.status = 'approved'
      ORDER BY p.created_at DESC
      LIMIT 10
    `,
    allowed: 'index',
  },
  {
    name: 'posts.my_posts',
    sql: `
      SELECT id
      FROM posts
      WHERE user_id = 1 AND status = 'approved'
      ORDER BY created_at DESC
      LIMIT 10
    `,
    allowed: 'index',
  },
  {
    name: 'posts.my_likes',
    sql: `
      SELECT target_id
      FROM reactions
      WHERE target_type = 'post' AND value = 1 AND user_id = 1
      LIMIT 10
    `,
    allowed: 'index',
  },
  {
    name: 'posts.findByIdAggregated',
    sql: `
      SELECT p.id, p.title, p.content
      FROM posts p
      WHERE p.id = 1
    `,
    allowed: 'index',
  },
  {
    name: 'comments.findByPost',
    sql: `
      SELECT c.id, c.content
      FROM comments c
      WHERE c.post_id = 1 AND c.status = 'approved'
      ORDER BY c.created_at ASC
    `,
    allowed: 'index',
  },
  {
    name: 'reactions.lookup',
    sql: `
      SELECT id, value
      FROM reactions
      WHERE user_id = 1 AND target_type = 'post' AND target_id = 1
    `,
    allowed: 'index',
  },
  {
    name: 'sessions.findValid',
    sql: `
      SELECT s.id, s.user_id, s.expires_at
      FROM sessions s
      WHERE s.id = 'x' AND s.expires_at > CURRENT_TIMESTAMP
    `,
    allowed: 'index',
  },
  {
    name: 'notifications.unread_for_user',
    sql: `
      SELECT id, type, created_at
      FROM notifications
      WHERE user_id = 1 AND is_read = 0
      ORDER BY created_at DESC
      LIMIT 50
    `,
    allowed: 'index',
  },
  {
    name: 'activity.listForUser',
    sql: `
      SELECT id, action, created_at
      FROM activity_logs
      WHERE user_id = 1
      ORDER BY created_at DESC
      LIMIT 50
    `,
    allowed: 'index',
  },
  {
    name: 'role_requests.listPending',
    sql: `
      SELECT rr.id, rr.user_id, rr.requested_role
      FROM role_requests rr
      WHERE rr.status = 'pending'
      ORDER BY rr.created_at ASC
    `,
    allowed: 'index',
  },
  {
    name: 'moderation.postsPending',
    sql: `
      SELECT p.id, p.title
      FROM posts p
      WHERE p.status = 'pending'
      ORDER BY p.created_at ASC
    `,
    allowed: 'index',
  },
  {
    name: 'media.listForPost',
    sql: `
      SELECT id, storage_path
      FROM media
      WHERE post_id = 1 AND kind = 'post_image'
      ORDER BY created_at ASC
    `,
    allowed: 'index',
  },
  {
    name: 'oauth_states.consume',
    sql: `
      SELECT * FROM oauth_states
      WHERE state = 'x' AND datetime(expires_at) > datetime('now')
    `,
    allowed: 'index',
  },
  {
    name: 'identities.lookup',
    sql: `
      SELECT id, user_id
      FROM identities
      WHERE provider = 'google' AND provider_user_id = 'x'
    `,
    allowed: 'index',
  },
  // Small, low-volume tables — full scan is fine.
  {
    name: 'categories.all',
    sql: `SELECT id, name FROM categories ORDER BY name`,
    allowed: 'scan_ok',
  },
  {
    name: 'schema_migrations.list',
    sql: `SELECT name FROM schema_migrations ORDER BY id`,
    allowed: 'scan_ok',
  },
];

// ---------------------------------------------------------------------------
// Analysis helpers
// ---------------------------------------------------------------------------
function classifyPlan(detail) {
  // PostgreSQL-style hints never appear in SQLite; these are the real signals:
  //   "SEARCH ... USING INDEX ..."     — index used
  //   "SEARCH ... USING INTEGER PRIMARY KEY" — PK used
  //   "SCAN table_name"                 — full table scan
  //   "SCAN table_name USING COVERING INDEX ..." — covering index scan (good)
  //   "USE TEMP B-TREE FOR ORDER BY"    — sort without index; not necessarily bad
  if (/USING (COVERING )?INDEX|USING INTEGER PRIMARY KEY|SEARCH .* USING/.test(detail)) {
    return 'index';
  }
  if (/^SCAN (TABLE )?[a-zA-Z_]+(?! USING)/i.test(detail)) {
    return 'scan';
  }
  return 'other';
}

function runOne(q) {
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${q.sql}`).all();
  const lines = rows.map((r) => r.detail || JSON.stringify(r));
  const classes = lines.map(classifyPlan);
  const hasIndex = classes.includes('index');
  const hasScan = classes.includes('scan');

  let verdict;
  if (hasIndex && !hasScan) verdict = 'ok_index';
  else if (hasIndex && hasScan)
    verdict = 'mixed'; // e.g. JOIN with one side scanned
  else if (hasScan) verdict = q.allowed === 'scan_ok' ? 'ok_scan' : 'warn_full_scan';
  else verdict = 'unknown';

  return { name: q.name, allowed: q.allowed, lines, verdict };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
function printHuman(results) {
  const ICONS = {
    ok_index: '✅',
    ok_scan: '🟢',
    mixed: '🟡',
    warn_full_scan: '⚠️ ',
    unknown: '❓',
  };
  const LABELS = {
    ok_index: 'uses index',
    ok_scan: 'full scan (small table — OK)',
    mixed: 'mixed (JOIN)',
    warn_full_scan: 'FULL SCAN — needs index',
    unknown: 'unknown plan',
  };

  console.log('');
  console.log('Index Observatory — EXPLAIN QUERY PLAN');
  console.log('='.repeat(72));
  console.log(`DB:     ${config.db.path}`);
  console.log(`Env:    ${config.env}`);
  console.log(
    `Tables: ${db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table'").get().c}`
  );
  console.log('');

  let warnings = 0;
  for (const r of results) {
    const icon = ICONS[r.verdict];
    const label = LABELS[r.verdict];
    console.log(`${icon}  ${r.name.padEnd(35)} ${label}`);
    for (const line of r.lines) {
      console.log(`     └─ ${line}`);
    }
    if (r.verdict === 'warn_full_scan') warnings++;
    console.log('');
  }

  console.log('='.repeat(72));
  if (warnings === 0) {
    console.log('✅ All critical queries use an index (or scan on a small table).');
    console.log('   No action required.');
  } else {
    console.log(`⚠️  ${warnings} critical query(ies) perform a FULL TABLE SCAN.`);
    console.log('   Add an index on the WHERE/ORDER BY columns, or move the query');
    console.log('   to a small table if it is not hot.');
  }
  console.log('');
  return warnings;
}

function printJson(results) {
  const out = {
    db_path: config.db.path,
    env: config.env,
    generated_at: new Date().toISOString(),
    queries: results.map((r) => ({
      name: r.name,
      verdict: r.verdict,
      allowed: r.allowed,
      plan: r.lines,
    })),
    warnings: results.filter((r) => r.verdict === 'warn_full_scan').length,
  };
  console.log(JSON.stringify(out, null, 2));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const json = process.argv.includes('--json');
  const results = QUERIES.map(runOne);

  let warnings;
  if (json) {
    printJson(results);
    warnings = results.filter((r) => r.verdict === 'warn_full_scan').length;
  } else {
    warnings = printHuman(results);
  }

  process.exit(warnings > 0 ? 1 : 0);
}

try {
  main();
} catch (err) {
  console.error('Index observatory failed:', err.message);
  console.error(err.stack);
  process.exit(2);
}
