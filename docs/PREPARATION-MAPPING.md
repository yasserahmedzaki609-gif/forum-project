# Preparation Modules → Code Artifacts Mapping

This document maps each preparation module (P01–P26) from the Anas Roadmap
to the concrete code artifact in this repository.

| Module | Description | Code artifact | Verification |
| --- | --- | --- | --- |
| P01 | Node Runtime & Package Lab | `package.json`, `node_modules/` | `npm install` |
| P02 | HTTP Message & Bounded Body | `src/app.js` (express.json limit) | `tests/security.test.js` |
| P03 | HTML Forms & Safe Rendering | `public/index.html`, `src/utils/escapeHtml.js` | `tests/security.test.js` (XSS) |
| P04 | Community ERD | `docs/ERD.md` | Visual review |
| P05 | SQLite Schema & Migrations | `src/database/schema.js` (13 migrations) | `npm run db:inspect` |
| P06 | Topic & Reply Repository | `src/models/post.model.js`, `comment.model.js` | `tests/posts.test.js`, `comments.test.js` |
| P07 | Reaction State Machine | `src/models/reaction.model.js` | `tests/reactions.test.js` |
| P08 | Feed Filters & Pagination | `src/models/post.model.js::list()` | `tests/posts.test.js` |
| P09 | Registration & bcrypt | `src/utils/password.js` | `tests/auth.test.js` |
| P10 | Sessions + Route Guards + CSRF | `src/middleware/auth.js`, `csrf.js` | `tests/security.test.js` |
| P11 | Failure Handling + Tests | `src/middleware/errorHandler.js` | `npm test` (114 tests) |
| P12 | Docker + Volumes | `Dockerfile`, `docker-compose.yml`, `entrypoint.sh` | `docker compose up` |
| P13 | External API Client | `src/auth/providers/` | `tests/sso.*.test.js` |
| P14 | OAuth + PKCE | `src/auth/pkce.js`, `models/oauthState.model.js` | `tests/sso.google.test.js` |
| P15 | Google/GitHub + Linking | `src/auth/identity.service.js` | `tests/sso.linking.test.js` |
| P16 | Multipart Streaming | `src/media/upload.js` | `tests/media.upload.test.js` |
| P17 | Image Validation & Lifecycle | `src/media/process.js`, `storage.js` | `tests/media.*.test.js` |
| P18 | HTTPS + Certificates | `server.js` + `entrypoint.sh` | `docker compose ps` (healthy) |
| P19 | Rate Limiting | `src/middleware/rateLimit.js` | `tests/f04.ratelimit.test.js` |
| P20 | Session Defense | `src/models/session.model.js` | `tests/f04.session.test.js` |
| **P21** | **Live DB Encryption** | **`src/database/db.js` (PRAGMA key) + `scripts/backup-db.js` + `scripts/restore-db.js`** | **`tests/f04.db-encryption.test.js`** |
| P22 | Roles & Permissions | `src/middleware/auth.js` (requireModerator/Admin) | `tests/f05.moderation.test.js` |
| P23 | Approval Queue & Reports | `src/controllers/moderation.controller.js` | `tests/f05.moderation.test.js` |
| P24 | Owned Editing & Stale | `src/models/post.model.js` (updated_at lock) | `tests/f06.advanced.test.js` |
| P25 | Transactional Events | `src/models/notification.model.js` | `tests/f06.advanced.test.js` |
| P26 | Personal Activity | `src/models/activity.model.js` | `tests/f06.advanced.test.js` |

## Final Assignments (F01–F06)

| Assignment | Status | Evidence |
| --- | --- | --- |
| F01: Base Forum | ✅ Complete | `tests/{auth,posts,comments,reactions,security}.test.js` |
| F02: SSO | ✅ Complete | `tests/sso.{google,github,linking}.test.js` |
| F03: Media Upload | ✅ Complete | `tests/media.*.test.js` |
| F04: Security | ✅ Complete | `tests/f04.{password,ratelimit,session,db-encryption}.test.js` |
| F05: Moderation | ✅ Complete | `tests/f05.moderation.test.js` |
| F06: Advanced | ✅ Complete | `tests/f06.advanced.test.js` |

**Total: 26/26 preparation modules (including P21 Bonus), 6/6 final assignments, 114/114 tests passing.**

**Week-1 fixes:** See `docs/AUDIT-CHECKLIST.md` for the complete list of post-launch security and correctness fixes (B1-B5, B7-B8, C2, C7, G1, G1+, H1).
