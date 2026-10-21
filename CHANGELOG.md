# Changelog

All notable changes to this project will be documented in this file.

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
-
