# Q&A Preparation — 20 Anticipated Questions

Concise, defensible answers for the v1.4.0 live review.

---

## 1. Why SQLite instead of PostgreSQL?

**Answer:** The Anas Roadmap mandates SQLite. It's embedded (zero external
service), WAL mode gives concurrent reads without writer blocking, and it
fits Docker perfectly (single file in a volume). Production-ready for a
forum at this scale.

---

## 2. How does the two-layer moderation flow work (P24)?

**Answer:** When F05 is installed, `moderationMode.js` returns 'pending'
from `initialPostStatus()`. New content starts pending. When F05 is NOT
installed, it returns 'approved' so a bare F01 forum stays usable. We
check two tables (`reports` + `role_requests`) to catch partial installs.

---

## 3. Why `PRAGMA key` needs escaping?

**Answer:** `db.pragma(\`key = '${password}'\`)` — if the password contains
a single quote (e.g. `O'Brien`), the statement breaks. Worse, a crafted
value like`'; PRAGMA x; --` could inject pragmas. We escape by doubling
single quotes: `password.replace(/'/g, "''")`. Tested with
`O'Brien-test-'quoted'`.

---

## 4. How do you prevent the "lost update" problem?

**Answer:** Optimistic locking via `updated_at`. On PUT, the client sends
the timestamp it loaded. The UPDATE includes `WHERE updated_at = ?`. If
another user changed it, `changes = 0` and we return 409 Conflict. The
client must reload.

---

## 5. Why are comment/post/reaction writes wrapped in transactions (P25)?

**Answer:** Three writes happen: content + activity log + notification. If
the notification fails (constraint, DB error), the content would be
committed without an alert — broken UX. `db.transaction` guarantees all
three commit or none. Tested with `jest.spyOn` to force a failure.

---

## 6. What is the Index Observatory (P26)?

**Answer:** `npm run db:observatory` runs `EXPLAIN QUERY PLAN` against 16
critical queries (feed, filters, sessions, notifications, role requests,
media). Each plan is classified: uses index ✅, full scan on small table 🟢,
full scan on hot table ⚠️. Exit code 1 on warnings so CI can catch
regressions.

---

## 7. Why replace `file-type` with a custom detector?

**Answer:** `file-type@16` has CVE-2026-31808 (infinite loop on a 55-byte
ASF file). Upgrading to v22 requires migrating to ESM. We only accept 4
formats (JPEG/PNG/WebP/GIF), so `src/utils/imageType.js` checks magic
bytes in 50 lines. No parser = no CVE, 10× faster.

---

## 8. How does the SSO-first admin bootstrap work (B1)?

**Answer:** `auth.controller.register` made the first user admin, but the
SSO path (`identity.service.loginTx`) didn't. An SSO-only deployment had
no admin. Fixed by checking `stmtCountUsers` inside `loginTx` — first-ever
user gets 'admin' regardless of signup path. Tested with Google and GitHub.

---

## 9. Why does `changePassword` revoke ALL sessions (B2)?

**Answer:** Previously `sessionModel.rotate` deleted only the current
session. If a user changes their password after a leak, an attacker on
another device keeps working. Fixed: `deleteAllForUser(userId)` then
`create()` for the current device. Tested with two sessions.

---

## 10. How are sessions hardened?

**Answer:** Three layers:

1. **UA binding**: `user_agent_hash` stored. Mismatch → revoke.
2. **Idle timeout**: 2 hours (default; configurable via `.env`).
3. **Absolute timeout**: 7 days.
4. **Rotation**: New UUID on login and password change.
5. **Throttled touch**: `last_seen_at` written 1×/5min, not 1×/request.

---

## 11. Why use `__Host-` prefix on the CSRF cookie (C6)?

**Answer:** `__Host-` enforces Secure + Path=/ + no Domain. A compromised
subdomain cannot set a cookie the main domain reads. We only use it in
production (Secure required); in dev/test, browsers reject `__Host-` over
HTTP, so we keep plain `csrf_token`.

---

## 12. How do you prevent SSO account takeover?

**Answer:** In `identity.service.js`, when a provider email matches an
existing local user, we only link if `emailVerified === true`. Otherwise
we return 409. An attacker registering a provider account with an
unverified victim email is rejected. Tested with `emailVerified: false`.

---

## 13. What's the account deletion flow (C4)?

**Answer:** `DELETE /api/users/me`. Password users re-enter currentPassword;
SSO-only users type their username. The only admin cannot delete (409 lock
prevention). `ON DELETE CASCADE` cleans posts/comments/reactions/sessions/
media/identities/reports; `moderation_logs.actor_id → SET NULL` preserves
audit.

---

## 14. Why did you split `verify` and `audit` (F3)?

**Answer:** `npm run verify` originally ran `lint && test && audit`. During
a network outage, `npm audit` returned 503 and verify failed with exit 1
even though lint + 180 tests were clean. Fixed: `verify` = lint + test
(offline, deterministic); `audit` = npm audit; `verify:full` = verify +
audit (for CI). Pre-commit gates must not depend on network.

---

## 15. How did you catch the `.gitignore` media bug?

**Answer:** `.gitignore` had `media/` (no leading slash), which matches at
any depth — including `src/media/`. The entire media pipeline was
untracked; a fresh clone would fail with `Cannot find module '../media'`.
Fixed to `/media/` (root-only) and tracked all 5 files. Verified with
`git clone` in `$TEMP` — all 5 files present.

---

## 16. Why are there zero lint problems (F1)?

**Answer:** ESLint 9 flat config split by environment:

- Node files (`src/`, `scripts/`, `tests/`) → `globals.node` + `globals.jest`.
- Browser files (`public/`) → `globals.browser`.
- `_err`/`_token` prefixes for intentionally unused vars.
- `catch (_err)` when the binding isn't referenced.
- `eslint-plugin-node` was NOT used (no ESLint 9 support; unused).
Result: 0 errors, 0 warnings.

---

## 17. Why does `src/media/*` matter for cloning?

**Answer:** `src/controllers/media.controller.js` has
`require('../media')` which resolves to `src/media/index.js`. If that file
is untracked, a fresh clone fails at `server.js` startup. We added all 5
files (index, process, storage, upload, detect) and verified with
`git clone` + `Test-Path` × 4 = True.

---

## 18. What does the audit trail log (C1)?

**Answer:** Append-only `moderation_logs`:

- `post.status_change`, `comment.status_change` (approve/reject/pending)
- `user.role_change` (promote/demote)
- `report.status_change` (resolve/dismiss)
- `role_request.approve` / `role_request.reject`

Each row stores `metadata` JSON (previous + new state) + `actor_id`
(SET NULL on user delete, preserving audit). Endpoint:
`GET /api/moderation/audit-log` (admin only), filters by target/actor.

---

## 19. Why is `uuid@9` an accepted risk?

**Answer:** GHSA-w5hq-g745-h8pq affects `v3()`, `v5()`, `v6()` with an
external `buf`. Our codebase uses only `uuidv4()` (in
`session.model.js`). Upgrading to `uuid@14` breaks CommonJS (v12+ are
ESM-only). Documented in `SECURITY.md` under "Accepted Risks" — a
conscious decision, not an oversight.

---

## 20. How do you test transactions rollback (P25)?

**Answer:** `jest.spyOn(notificationModel, 'create').mockImplementationOnce(() => { throw new Error(...); })`. Then call `POST /api/posts/:id/comments`. The transaction rolls back — DB comment count is unchanged. Same pattern for post creation (activity fails) and reactions (notification fails). 6 tests in `f06.transactions.test.js`.

---

## Bonus: What's NOT implemented (honest)

- **Real-time SSE/WebSocket**: out of scope per Roadmap (optional, requires new prep deliverable).
- **Additional SSO providers**: Google + GitHub only.
- **Rich text editor**: plain text + escapeHtml.
- **Multi-instance scaling**: single-process, SQLite file lock.
- **`uuid@14`**: breaks CommonJS; documented.

If the reviewer requests any of these, we acknowledge them as
"Level-up references requiring a new completed preparation deliverable"
per the Roadmap's "Optional technology changes" section.
