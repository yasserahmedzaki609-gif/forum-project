# Project Audit & Compliance Checklist

Mapping of the Anas Roadmap (P01–P26, F01–F06) to the implementation.
Updated for **v1.4.1** (Week-1 + Week-2 + Week-3 complete).

## Roadmap Compliance (F01 → F06)

| Phase | Description | Status | Tests |
| --- | --- | --- | --- |
| **F01** | Base Forum | ✅ Complete | 46 |
| **F02** | SSO (Google & GitHub) | ✅ Complete | 16 |
| **F03** | Image Upload | ✅ Complete | 12 |
| **F04** | Security Hardening | ✅ Complete | 22 |
| **F05** | Moderation (Roles) | ✅ Complete | 23 |
| **F06** | Advanced Features | ✅ Complete | 20 |
| **P21** | DB Encryption (Bonus) | ✅ Complete | 6 |
| **D/C/F** | Week-3 (UI, Security & Quality) | ✅ Complete | 35 |
| **Total** | **Full Track + Week-1/2/3** | **✅ 100%** | **180/180** |

---

## Preparation Modules (P01–P26)

| # | Module | Status | Artifact |
| --- | --- | --- | --- |
| P01 | Node Runtime & Package Lab | ✅ | `package.json` |
| P02 | HTTP Message & Bounded Body | ✅ | `src/app.js` |
| P03 | HTML Forms & Safe Rendering | ✅ | `public/index.html`, `escapeHtml.js` |
| P04 | Community ERD | ✅ | `docs/ERD.md` |
| P05 | SQLite Schema & Migrations | ✅ | `src/database/schema.js` (15 migrations) |
| P06 | Topic & Reply Repository | ✅ | `post.model.js`, `comment.model.js` |
| P07 | Reaction State Machine | ✅ | `reaction.model.js` |
| P08 | Feed Filters & Pagination | ✅ | `post.model.js::list()` |
| P09 | Registration & bcrypt | ✅ | `auth.controller.js`, `password.js` |
| P10 | Sessions + Route Guards + CSRF | ✅ | `session.model.js`, `csrf.js` |
| P11 | Failure Handling + Tests | ✅ | `errorHandler.js`, 180 tests |
| P12 | Docker + Volumes | ✅ | `Dockerfile`, `docker-compose.yml`, `entrypoint.sh` |
| P13 | External API Client | ✅ | `src/auth/providers/` |
| P14 | OAuth + PKCE | ✅ | `pkce.js`, `oauthState.model.js` |
| P15 | Google/GitHub + Linking | ✅ | `identity.service.js` |
| P16 | Multipart Streaming | ✅ | `src/media/upload.js` |
| P17 | Image Validation & Lifecycle | ✅ | `src/media/process.js`, `storage.js`, `detect.js` |
| P18 | HTTPS + Certificates | ✅ | `server.js`, `entrypoint.sh` |
| P19 | Rate Limiting | ✅ | `rateLimit.js` |
| P20 | Session Defense | ✅ | `session.model.js` (UA binding, throttle) |
| P21 | Live DB Encryption (Bonus) | ✅ | `src/database/db.js` (PRAGMA key), `backup-db.js`, `restore-db.js` |
| P22 | Roles & Permissions | ✅ | `middleware/auth.js` |
| P23 | Approval Queue + Role Requests + Reports + Categories | ✅ | `moderation.controller.js`, `roleRequest.model.js` |
| P24 | Owned Editing + Stale + Conditional Adapter | ✅ | `post.model.js` (updated_at), `moderationMode.js` |
| P25 | Transactional Events + Notification Inbox | ✅ | `services/post.service.js`, `services/comment.service.js` |
| P26 | Personal Activity Queries + Index Observatory | ✅ | `activity.model.js`, `scripts/index-observatory.js` |

---

## Functional Requirements

| # | Requirement | Status | Implementation |
| --- | --- | --- | --- |
| 1 | HTTPS | ✅ | `server.js` (TLS 1.2/1.3) |
| 2 | Cipher suites | ✅ | Mozilla Intermediate profile |
| 3 | Server timeouts | ✅ | `requestTimeout`, `headersTimeout`, `keepAliveTimeout` |
| 4 | Rate limiting | ✅ | `express-rate-limit` (IPv6-safe), layered |
| 5 | Passwords encrypted | ✅ | bcrypt cost 12 |
| 6 | Session cookie UUID | ✅ | `uuidv4()` server-side store |
| 7 | Certificates via env | ✅ | `.env` paths + `entrypoint.sh` |
| 8 | DB encrypted (P21) | ✅ | SQLCipher + `PRAGMA key` |
| 9 | DB backup/restore (P21) | ✅ | `backup-db.js`, `restore-db.js` |
| 10 | Account deletion (C4) | ✅ | `DELETE /api/users/me` |
| 11 | Request logging (H2) | ✅ | `src/app.js` middleware |
| 12 | `robots.txt` + `security.txt` | ✅ | `public/robots.txt`, `public/.well-known/security.txt` |

---

## Communication & Core Features

| # | Requirement | Status | Implementation |
| --- | --- | --- | --- |
| 13 | Register/Login/Logout | ✅ | `auth.controller.js` |
| 14 | Create Posts & Comments | ✅ | `posts.controller.js`, `comments.controller.js` |
| 15 | Associate Categories | ✅ | `post_categories` table, UI checkboxes |
| 16 | Like/Dislike | ✅ | `reactions` table (dedup unread notifications) |
| 17 | Visible to guests | ✅ | Public GET routes |
| 18 | Filter by Category / My Posts / My Likes | ✅ | `post.model.js::list()` |
| 19 | Pagination | ✅ | LIMIT / OFFSET |
| 20 | Media upload (UI + API) | ✅ | `public/index.html` + `media.controller.js` |
| 21 | Report content (UI + API) | ✅ | `public/index.html` + `moderation.controller.js` |
| 22 | Change password (UI + API) | ✅ | `public/index.html` + `auth.controller.js` |
| 23 | **Role Requests (P23)** | ✅ | `POST /api/roles/request` + admin review |
| 24 | **Audit Trail (C1)** | ✅ | `moderation_logs` (append-only), `GET /api/moderation/audit-log` |
| 25 | **Connected Accounts (C3)** | ✅ | `GET /api/users/me/identities` + UI |
| 26 | **Comment Edit/Delete UI (D1)** | ✅ | `public/index.html` modal + `script.js` |
| 27 | **Admin Categories UI (D2)** | ✅ | `#admin-categories-section` in dashboard |
| 28 | **Role Management UI (D3)** | ✅ | `GET /api/users` + dropdown + confirmation |
| 29 | **Pending Comments Visible to Author (D4)** | ✅ | `findByPost(postId, viewerId)` |
| 30 | **/me includes identities (D5)** | ✅ | auth controller `me()` |

---

## Code Quality & Testing

| # | Requirement | Status | Implementation |
| --- | --- | --- | --- |
| 31 | Layered architecture | ✅ | Controllers, Services, Models, Middleware, Validators |
| 32 | Unit/Integration Tests | ✅ | **26 suites, 180 tests** (Jest + Supertest) |
| 33 | Zero Lint problems | ✅ | ESLint 9 flat config + Prettier 3 → **0 errors, 0 warnings** |
| 34 | Verify script | ✅ | `npm run verify` = lint + test (offline, deterministic) |
| 35 | Docker Multi-stage | ✅ | Minimized image, no build tools in runtime |
| 36 | Fresh clone works | ✅ | Verified (all 5 `src/media/*` tracked) |

---

## Technical Constraints

| # | Constraint | Status |
| --- | --- | --- |
| 37 | Use SQLite | ✅ `better-sqlite3-multiple-ciphers` |
| 38 | Use Docker | ✅ `Dockerfile` + `docker-compose.yml` |
| 39 | No frontend frameworks | ✅ Vanilla HTML/CSS/JS |
| 40 | Only allowed packages | ✅ See `package.json` |
| 41 | SELECT/CREATE/INSERT | ✅ Extensively in `models/` and `schema.js` |
| 42 | P21 DB Encryption | ✅ SQLCipher |

---

## Week-1 Fixes (v1.2.0)

| # | ID | Fix |
| --- | --- | --- |
| 1 | **B1** | First-ever SSO user bootstrapped as admin |
| 2 | **B2** | `changePassword` revokes ALL sessions |
| 3 | **B3** | Escaped single quotes in `PRAGMA key` |
| 4 | **B4** | Deduplicated unread like-notifications |
| 5 | **B5** | Removed `sessionId` from `/me` |
| 6 | **B7** | Corrected DEMO-SCRIPT Step 7 (`docker exec` defaults to root) |
| 7 | **B8** | Hide stack traces in test mode (`errorHandler.js`) |
| 8 | **C2** | `reportLimiter` (5/hour/user) |
| 9 | **C7** | Dropped `DAC_OVERRIDE` capability |
| 10 | **G1** | Media test isolation |
| 11 | **G1+** | Forced `DB_PASSWORD=''` in test mode |
| 12 | **H1** | `GET /health` endpoint |

**New tests:** 7 (114 → 121 cumulative).

---

## Week-2 Fixes (v1.3.0)

| # | ID | Fix |
| --- | --- | --- |
| 1 | **P23** | Role Requests (migration 014, model, 4 endpoints) |
| 2 | **P24** | Conditional Moderation Adapter (pending by default) |
| 3 | **P25** | Atomic transactions (comment/post/reaction) |
| 4 | **P26** | Index Observatory (`npm run db:observatory`) |
| 5 | **C1** | Append-only audit trail (migration 015) |
| 6 | **C3** | Identities list + unlink with session revocation |

**New tests:** 40 (121 → 161 cumulative).

---

## Week-3 Fixes (v1.4.0)

### Batch 1 — UI Completions

| # | ID | Fix |
| --- | --- | --- |
| 1 | **D1** | Comment Edit/Delete UI (modal + owner buttons) |
| 2 | **D2** | Admin Categories UI |
| 3 | **D3** | Role Management UI + `GET /api/users` |
| 4 | **D4** | Pending comments visible to author |
| 5 | **D5** | `/me` includes `identities` |

### Batch 2 — Security & Ops

| # | ID | Fix |
| --- | --- | --- |
| 6 | **C4** | Account deletion (`DELETE /api/users/me`) |
| 7 | **C5** | Session `last_seen_at` throttling |
| 8 | **C6** | `__Host-` prefix on CSRF cookie (prod) |
| 9 | **C8** | `robots.txt` + `.well-known/security.txt` |
| 10 | **H2** | Request logging middleware |

### Batch 3 — Code Quality

| # | ID | Fix |
| --- | --- | --- |
| 11 | **F1** | ESLint 9 flat config + Prettier 3 (99 files formatted) |
| 12 | **F2** | `engines: node >=22` in package.json |
| 13 | **F3** | `verify` split (offline + `audit` + `verify:full`) |

### Fixed

| # | Fix |
| --- | --- |
| 14 | `.gitignore media/` → `/media/` (root-only) + all 5 `src/media/*` tracked |
| 15 | `SECURITY.md` restored (7.7 bash block + Accepted Risks) |
| 16 | `verify` decoupled from network (`npm audit` split) |

### Security

| # | Fix |
| --- | --- |
| 17 | Replaced `file-type@16` (CVE-2026-31808) with `src/utils/imageType.js` |
| 18 | Documented `uuid@9` (GHSA-w5hq-g745-h8pq) as accepted risk |

**New tests:** 19 (161 → 180 cumulative).

---

## Known Accepted Risks

| Package | CVE | Rationale |
| --- | --- | --- |
| `uuid@9` | GHSA-w5hq-g745-h8pq | Only `v4()` is used; CVE affects `v3/v5/v6` with external `buf`. Upgrading to `v14` breaks CommonJS. Documented in `SECURITY.md`. |

**Resolved:** `file-type@16` (CVE-2026-31808) — replaced with custom magic-byte detector.

---

## Statistics Summary

| Metric | Value |
| --- | --- |
| Test Suites | **26** |
| Tests | **180** |
| Migrations | **15** |
| Database Tables | **16** |
| Lint Errors | **0** |
| Lint Warnings | **0** |
| npm audit (high/critical) | **0** |
| npm audit (moderate) | 1 (`uuid` — documented) |
| Prettier files formatted | 101 |
| Roadmap P01–P26 | **26/26** |
| Final Assignments F01–F06 | **6/6** |
| Bonus P21 | **✅ Complete** |
