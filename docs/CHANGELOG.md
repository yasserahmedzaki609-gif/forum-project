<!-- markdownlint-disable MD024 -->
# Changelog

All notable changes to this project will be documented in this file.

## [1.4.0] — Week-3 Completion: UI, Security & Code Quality

### Added (UI — Batch 1)

- **D1 — Comment Edit/Delete UI**: modal + owner-only buttons. Backend
  (PUT/DELETE /api/comments/:id) already existed from F06; the frontend
  had no way to call it.
- **D2 — Admin Categories UI**: add/list categories from the moderation
  dashboard. Backend (POST /api/admin/categories) already existed.
- **D3 — Role Management UI + `GET /api/users`**: admins can see the full
  user list and change roles. New endpoint `GET /api/users` (admin only,
  no password hash leak) + select dropdown + confirmation dialog.
- **D4 — Pending Comments Visible to Author**: `findByPost(postId, viewerId)`
  now returns `WHERE status='approved' OR user_id=?`. After P24's
  moderation gate, users posting a comment saw it "disappear" — now they
  see their own pending comment (guests still see only approved).
- **D5 — `/me` Includes Identities**: response now has
  `identities: [{provider, email}]` for one-round-trip 'Connected
  Accounts'.

### Added (Security & Ops — Batch 2)

- **C4 — Account Deletion**: `DELETE /api/users/me`. Password users must
  re-enter currentPassword; SSO-only users must type their username. The
  only admin cannot delete themselves (409). ON DELETE CASCADE handles
  cleanup; moderation_logs.actor_id → SET NULL preserves audit.
- **C5 — Session `last_seen_at` Throttling**: was 1 UPDATE per
  authenticated request; now 1 per 5 min per session. Idle timeout
  accuracy unaffected (measured in hours).
- **C6 — `__Host-` Prefix on CSRF Cookie (production)**: enforced
  Secure + Path=/ + no Domain. In dev/test, plain `csrf_token` used
  (browsers require Secure for `__Host-`).
- **C8 — `robots.txt` + `.well-known/security.txt` (RFC 9116)**:
  courtesy directives + disclosure contact template.
- **H2 — Request Logging**: `[INFO] GET /path 200 5ms` per request.
  Skips headers/body/query (no PII/secrets). Disabled in `NODE_ENV=test`.

### Added (Code Quality — Batch 3)

- **F1 — ESLint 9 Flat Config + Prettier 3**:
  - Split config: Node files (src/scripts/tests) use `globals.node` +
    `globals.jest`; browser files (public/) use `globals.browser`.
  - 99 files formatted by Prettier (whitespace, quotes, trailing commas;
    no logic changes).
  - All unused vars cleaned — `_err`/`_token` prefixes for intentional
    unused; `catch (_err)` where the binding isn't referenced.
  - Result: `npm run lint` → 0 problems (0 errors, 0 warnings).
- **F2 — `engines` in package.json** (`node >=22`).
- **F3 — `npm run verify` Split**:
  - `verify` = lint + test (offline, deterministic)
  - `audit` = npm audit (network, may transiently 503)
  - `verify:full` = verify + audit (for CI)

### Fixed

- `.gitignore media/` matched `src/media/` at any depth — entire media
  pipeline (index, process, storage, upload, detect) was untracked. A
  fresh clone failed at `Cannot find module '../media'`. Fixed to
  `/media/` (root-only) and all 5 files tracked. Verified via clean
  clone test.
- `SECURITY.md` had 11 lines accidentally deleted in an earlier commit
  (section 7.7 Key rotation bash block + Accepted Risks section). Restored.
- `verify` previously ran `npm audit` inline, so a network error (503)
  returned exit 1 even when lint + 180 tests were clean. Split as above.

### Security

- Replaced `file-type@16` (CVE-2026-31808: infinite loop in ASF parser
  on malformed 55-byte input — DoS) with `src/utils/imageType.js`, a
  50-line magic-byte detector for JPEG/PNG/WebP/GIF. No parser = no CVE,
  ~10x faster. Removed `file-type` from package.json.
- Documented `uuid@9` (GHSA-w5hq-g745-h8pq) as accepted risk in
  `SECURITY.md`: our code uses `v4()` only; the CVE affects `v3/v5/v6`
  with external `buf`. Upgrading to `uuid@14` would break CommonJS.

### Tests

- Cumulative: **180 tests, 26 suites** (Week-1: 114 → Week-2: 161 →
  Week-3: 180). +19 tests since last release.
- Lint: 0 errors, 0 warnings.
- `npm run verify`: exit 0 (offline, deterministic).

### Deps

- Removed: `file-type`, `eslint-plugin-node` (unused, no flat-config
  support).
- Added: `eslint@9`, `eslint-config-prettier@9`, `prettier@3`, `globals@15`.

---

## [1.3.0] — Week-2 Features

### Added

- **P23 — Role Requests**: complete workflow (migration 014). Users request promotion, moderators see the queue, admins approve/reject. Safety rules: one pending request per user; only admins can review; regular users cannot request `admin` directly.
- **P24 — Conditional Moderation Adapter**: new content starts as `pending` when F05 is installed, `approved` otherwise. Approval Queue fills automatically.
- **P25 — Transactional Events**: comment/post/reaction writes wrapped in `db.transaction` — no partial state.
- **P26 — Index Observatory**: `npm run db:observatory` analyzes 16 critical queries.
- **C1 — Audit Trail**: append-only `moderation_logs` (migration 015). Admin-only `GET /api/moderation/audit-log`.
- **C3 — Identities Management**: users can list/unlink SSO providers. Revokes other sessions on unlink. UI: "Connected Accounts".

### Tests

- Added 47 tests: P23×11, P24×11, P25×6, C1×10, C3×9.
- Cumulative: 114 (Week 1) → 161 (Week 2).

---

## [1.2.0] — Week-1 Security & Correctness Fixes

### Security

- **B2**: `changePassword` now revokes **all** active sessions for the user,
  forcing every other device to re-authenticate. Previously only the current
  session was rotated, leaving an attacker's session intact even after the
  user "changed their password" — a critical flaw.
- **B3**: Escaped single quotes in `PRAGMA key` statements in `db.js`,
  `backup-db.js`, and `restore-db.js`. Prevents SQLCipher pragma injection
  when `DB_PASSWORD` contains a `'`. A password like `O'Brien` used to
  break DB open.
- **B5**: Removed `sessionId` from `/me` response. The client already holds
  the signed cookie; the raw UUID added no value but risked leaking into
  browser logs, screenshots, or error reporters.
- **B8**: `errorHandler.js` now hides stack traces in ALL environments
  except explicit development. Previously used `!config.isProd`, which
  included test mode.
- **C2**: Added `reportLimiter` (5 reports/hour/user) on `POST /api/reports`
  to prevent DoS on the moderation queue via report flooding.
- **C7**: Dropped `DAC_OVERRIDE` capability. Verified the container runs
  healthy with only `CHOWN`/`SETUID`/`SETGID`.

### Fixed

- **B1**: First-ever user is now bootstrapped as `admin` even when they
  signed up via Google or GitHub SSO.
- **B4**: Like → unlike → like no longer produces two separate notifications
  for the post owner. Unread duplicates are deduplicated at insert time.
- **B7**: Corrected `DEMO-SCRIPT.md` Step 7 — `docker compose exec` runs as
  root by Docker default; the app process itself runs as UID 1001 via
  `su-exec`. Demo now verifies via `/proc/1/status` and `--user 1001`.
- **Entrypoint**: Generate certs BEFORE `chown` and force `root:root` on
  `/app/certs` in Dockerfile. Previously caused a crash-restart loop when
  `DAC_OVERRIDE` was removed (Docker volume inherits 1001:1001 ownership
  from image, and root without `CAP_DAC_OVERRIDE` couldn't write).

### Added

- **H1**: `GET /health` endpoint that verifies DB connectivity via `SELECT 1`
  and returns 200/503. `docker-compose.yml` healthcheck now uses it instead
  of `/auth/providers` — DB-backed, faster, cleaner.

### Tests

- **G1**: `tests/helpers.js::resetDb` now wipes `./media/test` so media
  test files can run in any order without state pollution.
- **G1+**: `src/config/index.js` forces `dbPassword=''` when `NODE_ENV='test'`,
  making the test suite portable across machines regardless of `.env`.
- Added 7 regression tests: B1×3, B2, B3, B4, C2, H1.

### Docker

- Rebuilt multi-stage image with the corrected `entrypoint.sh` (certs first,
  chown second) and `Dockerfile` (excludes `/app/certs` from recursive chown).
- Verified container runs healthy with `/proc/1/status` showing `Uid: 1001`.

---

## [1.1.0] — Initial Release

- Full implementation of Anas Roadmap: P01–P26 + F01–F06 + P21 Bonus.
- 107 tests passing, 0 vulnerabilities.
