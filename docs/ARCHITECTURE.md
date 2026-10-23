# Architecture

## Layering

```text
┌─────────────────────────────────────────────────────┐
│  Client (Browser)                                   │
│   - HTML / CSS / Vanilla JS                         │
│   - No frontend framework (per constraints)         │
└─────────────────────────────────────────────────────┘
                        │ HTTPS
                        ▼
┌─────────────────────────────────────────────────────┐
│  Express App (src/app.js)                           │
│                                                     │
│  Middleware chain (order matters):                  │
│    1. Security headers (CSP, HSTS, XFO)             │
│    2. Body parsers (10kb limit)                     │
│    3. cookie-session (signed)                       │
│    4. General rate limiter                          │
│    5. attachSession (DB-validated)                  │
│    6. csrfProtection                                │
│    7. Static files                                  │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  Routes (src/routes/*)                              │
│   - URL → Controller mapping                        │
│   - apply requireAuth / validators / rate limiters  │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  Controllers (src/controllers/*)                    │
│   - HTTP-specific logic                             │
│   - Input validation (via middleware)               │
│   - Call services/models                            │
│   - Format responses                                │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  Services & Models (src/auth/*, src/models/*)       │
│   - Business logic                                  │
│   - DB queries (prepared statements)                │
│   - Transactions                                    │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  SQLite (better-sqlite3)                            │
│   - WAL mode                                        │
│   - Foreign keys enforced                           │
└─────────────────────────────────────────────────────┘

```

## Why each layer exists

| Layer | Responsibility | Never does |
| --- | --- | --- |
| **Middleware** | Cross-cutting concerns (auth, CSRF, rate limit) | Business logic |
| **Routes** | URL mapping + middleware composition | DB queries |
| **Controllers** | HTTP in → domain call → HTTP out | Direct SQL |
| **Services** | Policy + orchestration across models | HTTP knowledge |
| **Models** | Prepared statements + domain queries | Business policy |

## Key request flows

### Flow 1: User registers

```text
POST /register
  │
  ├─ authLimiter (max 50 per 15 min per IP)
  ├─ validate(validateRegister)
  │
  ▼
AuthController.register
  │
  ├─ userModel.findByEmail     → 409 if exists
  ├─ userModel.findByUsername  → 409 if exists
  ├─ hashPassword (bcrypt 12)
  ├─ userModel.create
  │
  ▼
201 { id, username }

```

### Flow 2: User logs in

```text
POST /login
  │
  ├─ authLimiter
  ├─ validate(validateLogin)
  │
  ▼
AuthController.login
  │
  ├─ userModel.findByUsername → 401 if not found
  ├─ verifyPassword (bcrypt.compare)
  ├─ sessionModel.create (UUID, TTL)
  ├─ req.session.sid = session.id
  │
  ▼
200 { id, username } + Set-Cookie: forum_session=[signed]

```

### Flow 3: SSO login via Google

```text
GET /auth/google
  │
  ├─ ensureEnabled (404 if not configured)
  ├─ authLimiter
  │
  ▼
ssoController.start
  │
  ├─ generateCodeVerifier, generateCodeChallenge (S256)
  ├─ generateState, generateNonce
  ├─ oauthStateModel.create(state, verifier, nonce, ...)
  │
  ▼
302 → Google authorization endpoint
      ([accounts.google.com/o/oauth2/v2/auth](https://accounts.google.com/o/oauth2/v2/auth)?...)

[user authorizes on Google]

GET /auth/google/callback?code=...&state=...
  │
  ├─ ensureEnabled
  ├─ authLimiter
  │
  ▼
ssoController.callback
  │
  ├─ oauthStateModel.consume(state) → row or 400
  ├─ check stored.provider === 'google'
  ├─ provider.exchangeCode({ code, codeVerifier, nonce })
  │    ├─ openid-client verifies ID token signature, iss, aud, exp, nonce
  │    └─ returns profile { provider, providerUserId, email, emailVerified, ... }
  ├─ identityService.resolveUser(profile, { linkUserId })
  │    ├─ if identity exists          → login
  │    ├─ if email matches + verified → link
  │    ├─ if email matches + unverified → 409
  │    └─ else create new user + identity
  ├─ sessionModel.create (UUID)
  ├─ req.session.sid = session.id
  │
  ▼
302 → redirect_to (or /)

```

### Flow 4: Protected resource

```text
POST /api/posts
  │
  ├─ Security headers
  ├─ Body parser (10kb)
  ├─ cookie-session
  ├─ General rate limiter
  ├─ attachSession     → req.user = { id, username, sessionId } or null
  ├─ csrfProtection    → 403 if token missing/invalid
  ├─ requireAuth       → 401 if req.user null
  ├─ validate(validateCreatePost) → 400 if invalid
  │
  ▼
PostsController.createPost
  │
  ├─ verify each categoryId exists
  ├─ postModel.create (transaction: insert post + link categories)
  │
  ▼
201 { id }

```

### Flow 5: Image upload (F03)

```text
POST /api/posts/:id/media
  │
  ├─ Security headers
  ├─ Body parser (skipped for multipart)
  ├─ cookie-session
  ├─ General rate limiter
  ├─ attachSession
  ├─ csrfProtection
  ├─ requireAuth
  ├─ uploadLimiter (20 req/min)
  ├─ mediaUploadGuard (415 if not multipart)
  │
  ▼
MediaController.uploadPostMedia
  │
  ├─ verify post exists + ownership
  ├─ verify per-user quota
  ├─ src/media/index.js → handleUpload(req)
  │    ├─ upload.js   (busboy streaming, size-bounded)
  │    ├─ detect.js   (magic bytes → reject non-image)
  │    ├─ process.js  (sharp: decode, dimension check, re-encode, strip EXIF)
  │    └─ storage.js  (SHA-256, atomic write, directory sharding)
  ├─ mediaModel.create
  │
  ▼
201 { id, url, width, height }

```

## Design decisions

### Why server-side sessions?

* Cookie carries only an opaque UUID.
* Logout revokes on the server instantly.
* Rotation on login prevents fixation.
* TTL enforced in DB, not trusted from the cookie.
* Cookies are signed (HMAC) via `cookie-session` so tampering fails.

### Why SQLite + migrations?

* Zero external dependencies for the academy environment.
* WAL mode gives concurrent reads without writer blocking.
* Migration runner in `src/database/schema.js` is idempotent: safe on every boot.
* `schema_migrations` table records applied migrations so reruns skip them.

#### Single source of truth

All database code lives under `src/database/` — nowhere else:

| File | Responsibility |
| --- | --- |
| `src/database/db.js` | Singleton connection + PRAGMAs (`foreign_keys = ON`, `journal_mode = WAL`) |
| `src/database/schema.js` | Ordered list of migrations (001–015) + the runner |
| `src/database/seed.js` | Idempotent default data (4 categories) |

There is intentionally **no `database.js` at the project root**. A leftover
prototype from before the layering refactor was removed because it:

1. Opened a **second connection** on a different path
(`__dirname/forum.db` instead of `./data/forum.db`), silently causing
"my data disappeared" confusion.
2. Defined a **stale, incompatible schema** — no `sessions`, no `identities`,
no `oauth_states`, no `media`, no `reports`, no `notifications`, no
`activity_logs`, and a `likes` table with a `post_id` column instead of
the unified `reactions(target_type, target_id, value)`.
3. Was **never copied into the Docker image**, proving the running app
already lived without it.

**Rule going forward:** any schema change MUST be added as a new numbered
migration in `src/database/schema.js`. Never add `db.exec('CREATE TABLE ...')`
anywhere else in the codebase.

### Why `openid-client` v6?

* OpenID Certified implementation.
* Native PKCE + nonce + ID token verification.
* Uses `fetch` (no HTTP library mismatch).
* Discovers issuer metadata automatically (Google).

### Why not Passport?

* Passport strategies add a layer of indirection.
* For only two providers and fine-grained control over linking, `openid-client` + raw OAuth2 (GitHub) is simpler and more auditable.

### Why double-submit CSRF instead of a library?

* No extra dependency.
* Constant-time comparison.
* HMAC-signed cookie (can't be forged).
* Token bound to the session lifetime.

### Why raw OAuth2 for GitHub?

* GitHub does **not** support OIDC discovery.
* No ID token, so no nonce validation is possible — but PKCE + state still work.
* We fetch `/user` and `/user/emails` explicitly and treat the primary email as verified.

### Why decode + re-encode for uploads?

* Re-encoding writes a **brand-new bitmap** from raw pixel data.
* Any appended bytes, EXIF tricks, or polyglot payloads are destroyed.
* This is the single most important defense against RCE via images.
* `sharp` also strips EXIF automatically, protecting user privacy.

### Why SHA-256 addressed storage?

* Deduplication: identical uploads share one file.
* Integrity: verifiable on backup/restore.
* Path safety: hex only — no `../`, no shell metacharacters.
* Directory sharding (`ab/cd/`) prevents one directory with millions of entries.
