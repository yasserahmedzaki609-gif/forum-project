// ============================================================================
// src/database/schema.js — Migration runner
// ----------------------------------------------------------------------------
// Every schema change is a numbered migration. The `schema_migrations` table
// records which migrations have been applied. Running this module on every
// boot is safe: applied migrations are skipped.
//
// Migration rules:
//   - Never modify an existing migration.
//   - Add new migrations with the next number (011_, 012_, ...).
//   - Each migration runs inside a transaction (SQLite DDL is transactional).
// ============================================================================

const db = require('./db');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Bootstrap: migrations table
// ---------------------------------------------------------------------------
// Must exist before we can check which migrations have been applied.
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------
// Ordered list. Never reorder. Never edit an applied migration.
// ---------------------------------------------------------------------------
const migrations = [
  // -------------------------------------------------------------------------
  // 001 — Users
  // -------------------------------------------------------------------------
  {
    name: '001_users',
    up: () => db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `),
  },

  // -------------------------------------------------------------------------
  // 002 — Sessions
  // -------------------------------------------------------------------------
  {
    name: '002_sessions',
    up: () => db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    `),
  },

  // -------------------------------------------------------------------------
  // 003 — Categories
  // -------------------------------------------------------------------------
  {
    name: '003_categories',
    up: () => db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      )
    `),
  },

  // -------------------------------------------------------------------------
  // 004 — Posts
  // -------------------------------------------------------------------------
  {
    name: '004_posts',
    up: () => db.exec(`
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
      CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
    `),
  },

  // -------------------------------------------------------------------------
  // 005 — Post ↔ Categories (many-to-many)
  // -------------------------------------------------------------------------
  {
    name: '005_post_categories',
    up: () => db.exec(`
      CREATE TABLE IF NOT EXISTS post_categories (
        post_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        PRIMARY KEY (post_id, category_id),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      )
    `),
  },

  // -------------------------------------------------------------------------
  // 006 — Comments
  // -------------------------------------------------------------------------
  {
    name: '006_comments',
    up: () => db.exec(`
      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        post_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
    `),
  },

  // -------------------------------------------------------------------------
  // 007 — Reactions (unified likes/dislikes)
  // -------------------------------------------------------------------------
  {
    name: '007_reactions',
    up: () => db.exec(`
      CREATE TABLE IF NOT EXISTS reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        target_type TEXT NOT NULL CHECK(target_type IN ('post','comment')),
        target_id INTEGER NOT NULL,
        value INTEGER NOT NULL CHECK(value IN (-1, 1)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, target_type, target_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_reactions_target ON reactions(target_type, target_id);
    `),
  },

  // -------------------------------------------------------------------------
  // 008 — Identities (F02)
  // -------------------------------------------------------------------------
  {
    name: '008_identities',
    up: () => db.exec(`
      CREATE TABLE IF NOT EXISTS identities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        provider TEXT NOT NULL CHECK(provider IN ('google','github')),
        provider_user_id TEXT NOT NULL,
        email TEXT,
        display_name TEXT,
        avatar_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider, provider_user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_identities_user ON identities(user_id);
      CREATE INDEX IF NOT EXISTS idx_identities_lookup ON identities(provider, provider_user_id);
    `),
  },

  // -------------------------------------------------------------------------
  // 009 — OAuth states (F02)
  // -------------------------------------------------------------------------
  {
    name: '009_oauth_states',
    up: () => db.exec(`
      CREATE TABLE IF NOT EXISTS oauth_states (
        state TEXT PRIMARY KEY,
        code_verifier TEXT NOT NULL,
        nonce TEXT NOT NULL,
        provider TEXT NOT NULL,
        redirect_to TEXT,
        link_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);
    `),
  },

  // -------------------------------------------------------------------------
  // 010 — Media (F03)
  // -------------------------------------------------------------------------
  {
    name: '010_media',
    up: () => db.exec(`
      CREATE TABLE IF NOT EXISTS media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        post_id INTEGER,
        kind TEXT NOT NULL CHECK(kind IN ('post_image','avatar')),
        original_name TEXT,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_media_user ON media(user_id);
      CREATE INDEX IF NOT EXISTS idx_media_post ON media(post_id);
      CREATE INDEX IF NOT EXISTS idx_media_sha ON media(sha256);
    `),
  },

  // -------------------------------------------------------------------------
  // 011 — Session security hardening (F04)
  // -------------------------------------------------------------------------
  {
    name: '011_session_security',
    up: () => db.exec(`
      ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;
      ALTER TABLE sessions ADD COLUMN user_agent_hash TEXT;

      UPDATE sessions SET expires_at = datetime(expires_at) WHERE expires_at LIKE '%T%';
      UPDATE sessions SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at) WHERE last_seen_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen_at);
    `),
  },

  // -------------------------------------------------------------------------
  // 012 — Moderation (F05)
  // -------------------------------------------------------------------------
  {
    name: '012_moderation',
    up: () => db.exec(`
      ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
        CHECK(role IN ('user', 'moderator', 'admin'));

      ALTER TABLE posts ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'
        CHECK(status IN ('approved', 'pending', 'rejected'));
      CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);

      ALTER TABLE comments ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'
        CHECK(status IN ('approved', 'pending', 'rejected'));

      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reporter_id INTEGER NOT NULL,
        target_type TEXT NOT NULL CHECK(target_type IN ('post', 'comment')),
        target_id INTEGER NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'dismissed')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
      CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
    `),
  },

  // -------------------------------------------------------------------------
  // 013 — Advanced Features (F06)
  // -------------------------------------------------------------------------
  // Adds:
  //   - updated_at to posts & comments (optimistic locking for editing)
  //   - notifications table
  //   - activity_logs table
  // -------------------------------------------------------------------------
  {
    name: '013_advanced_features',
    up: () => db.exec(`
      -- 1. Add updated_at to posts and comments
      ALTER TABLE posts ADD COLUMN updated_at DATETIME;
      UPDATE posts SET updated_at = strftime('%Y-%m-%d %H:%M:%f', created_at) WHERE updated_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_posts_updated ON posts(updated_at);

      ALTER TABLE comments ADD COLUMN updated_at DATETIME;
      UPDATE comments SET updated_at = strftime('%Y-%m-%d %H:%M:%f', created_at) WHERE updated_at IS NULL;

      -- 2. Notifications table
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        actor_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('like', 'comment', 'reply')),
        target_type TEXT NOT NULL CHECK(target_type IN ('post', 'comment')),
        target_id INTEGER NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
      CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

      -- 3. Activity Logs table
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('post_create', 'comment_create', 'post_edit', 'comment_edit')),
        target_type TEXT NOT NULL CHECK(target_type IN ('post', 'comment')),
        target_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id, created_at DESC);
    `),
  },

  // -------------------------------------------------------------------------
  // 014 — Role Requests (P23)
  // -------------------------------------------------------------------------
  // Users can request promotion to moderator/admin. Admins review requests
  // from the moderation dashboard.
  //
  // Why not reuse `reports`? Different lifecycle:
  //   - reports: user flags content for review → moderator resolves
  //   - role_requests: user asks for role → admin approves/rejects
  // They have different "reviewer" roles and different target types.
  //
  // ⚠️ Architectural Note: reviewed_by uses ON DELETE SET NULL (not CASCADE).
  // If an admin account is deleted, the review record remains for audit purposes
  // with reviewed_by = NULL. This is the correct design decision for immutability.
  // -------------------------------------------------------------------------
  {
    name: '014_role_requests',
    up: () => db.exec(`
      CREATE TABLE IF NOT EXISTS role_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        requested_role TEXT NOT NULL
          CHECK(requested_role IN ('moderator', 'admin')),
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK(status IN ('pending', 'approved', 'rejected')),
        reviewed_by INTEGER,
        reviewed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_role_requests_status
        ON role_requests(status);
      CREATE INDEX IF NOT EXISTS idx_role_requests_user
        ON role_requests(user_id);
    `),
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
function runMigrations() {
  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name)
  );

  for (const m of migrations) {
    if (applied.has(m.name)) continue;

    const tx = db.transaction(() => {
      m.up();
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(m.name);
    });

    try {
      tx();
      logger.info(`Migration applied: ${m.name}`);
    } catch (err) {
      logger.error(`Migration failed: ${m.name}`, err);
      throw err;
    }
  }
}

module.exports = { runMigrations };