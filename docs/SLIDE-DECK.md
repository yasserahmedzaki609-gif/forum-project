---
marp: true
theme: default
paginate: true
backgroundColor: #f4f7f6
---

# Forum Project: Full Stack Community

## From Authentication to Advanced Features (F01 → F06 + P21)

Prepared by:  الجنرال ياسر
Academy Roadmap Final Project

---

## The Journey (F01 → F06 + P21)

- **F01**: Base Forum (Auth, Posts, Comments, Reactions)
- **F02**: SSO Authentication (Google & GitHub with PKCE)
- **F03**: Verified Media Upload (Sharp, Busboy, Magic Bytes)
- **F04**: Security Hardening (Sessions, Rate Limits, Docker)
- **F05**: Moderation (Roles, Approval Queue, Reports)
- **F06**: Advanced Features (Editing, Notifications, Activity)
- **P21**: Live Database Encryption (SQLCipher Bonus)

**Result**: 18 Test Suites | 114 Tests | 0 Vulnerabilities

---

## Architecture: Layered & Modular

We used a strict Layered Architecture:

1. **Routes**: URL mapping & Middleware attachment.
2. **Middleware**: Auth, CSRF, Rate Limiting.
3. **Controllers**: HTTP request/response handling.
4. **Services & Models**: Business logic & Prepared SQL Statements.
5. **Database**: SQLite with WAL mode (and SQLCipher encryption).

*Why?* Separation of concerns, testability, and maintainability.

---

## F01 & F02: Secure Authentication

- **Local Auth**: bcrypt (cost 12) + Server-side Sessions (UUID).
- **Google SSO**: OpenID Connect (OIDC) with PKCE (S256).
- **GitHub SSO**: OAuth2 with raw PKCE.
- **Account Takeover Defense**: We **strictly reject** linking accounts if the provider returns an unverified email (`email_verified = false`).

---

## F03: Verified Media Pipeline

Uploading files is dangerous. We built a 4-stage pipeline:

1. **Busboy**: Streaming intake (limits memory).
2. **File-type**: Magic byte detection (no MIME spoofing).
3. **Sharp**: Decodes & re-encodes to WebP. Destroys polyglots, strips EXIF.
4. **Storage**: Atomic write, SHA-256 addressed, directory sharding.

---

## F04: Session & Infrastructure Security

- **Session Rotation**: New UUID on login. Kills fixation.
- **Global Logout**: Logging in kills all previous sessions (Single-session policy).
- **UA Binding**: Session tied to browser User-Agent hash.
- **Docker Hardening**: Read-only FS, `cap_drop: ALL`, Resource limits.
- **TLS 1.3**: Mozilla Intermediate ciphers, HSTS preload.

---

## F05: Moderation & RBAC

- **Roles**: User, Moderator, Admin.
- **Bootstrapping**: First registered user automatically becomes Admin.
- **Approval Queue**: Moderators can approve/reject pending posts/comments.
- **Reports**: Users report content; Moderators resolve/dismiss.

---

## F06: Advanced Features

- **Optimistic Locking**: Prevents "Stale Updates" (409 Conflict) using `updated_at` timestamps.
- **Notifications**: Bell icon triggered by likes/comments on your content.
- **Activity Feed**: Tracks personal history of edits and creations.

---

## P21: Live Database Encryption (Bonus)

- **SQLCipher**: `better-sqlite3-multiple-ciphers`.
- **Password-driven**: `DB_PASSWORD` in `.env` enables encryption.
- **Backup**: `npm run db:backup` → encrypted backup + manifest.
- **Restore**: `npm run db:restore <path>` → verified restore.
- **Verified**: `tests/f04.db-encryption.test.js` proves wrong passwords fail.

---

## Quality Assurance

- **18 Test Suites** / **114 Tests** (Jest + Supertest).
- **In-Memory DB**: Tests run isolated in `:memory:` SQLite.
- **Encrypted DB**: Tests use a temp file with SQLCipher (P21).
- **Security Check**: `npm audit` returns 0 vulnerabilities.

---

## Live Demonstration

### Switch to Browser & Terminal

1. Admin Bootstrapping & Dashboard.
2. Creating posts & Stale Update protection.
3. Notifications & Activity Feed.
4. Docker read-only proof via `/proc/1/status` (Uid: 1001).
5. Encrypted DB verification + `/health` endpoint proof.

---

## Conclusion & What We Learned

- Building a **production-ready** app requires more than just CRUD.
- Security is a **layered defense** (Session, Data, Infrastructure).
- **Testing** is what gives us confidence to refactor and scale.

*Thank you! Questions?*
