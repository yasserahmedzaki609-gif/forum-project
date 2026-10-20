# Forum Project — F01 → F06 Complete Track (+ P21 Bonus)

> A production-grade, full-stack community forum built with **Node.js, Express 5, and SQLCipher-encrypted SQLite**. This project implements the complete Anas Roadmap (P01–P26 + F01–F06), featuring enterprise-level authentication, hardened security, verified media uploads, comprehensive moderation workflows, advanced user features, and **live database encryption**.

[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/sqlite-3%20%2B%20SQLCipher-blue)](https://www.zetetic.net/sqlcipher/)
[![Express](https://img.shields.io/badge/express-5-lightgrey)](https://expressjs.com/)
[![Tests](https://img.shields.io/badge/tests-114%2F114%20passing-success)](#running-tests)
[![License](https://img.shields.io/badge/license-ISC-lightgrey)](./LICENSE)

---

## نبذة سريعة (Arabic Quick Intro)

مشروع منتدى متكامل يغطي المسار الكامل من P01 إلى P26 ثم F01 إلى F06، بما في ذلك بند P21 (تشفير قاعدة البيانات). يبدأ من الأساسيات، ويمر عبر SSO، رفع الصور، تقوية الجلسات، الإشراف، الميزات المتقدمة، وينتهي بقاعدة بيانات مشفّرة بـ SQLCipher.

---

## Features Overview

### F01 — Base Forum

- **Auth**: Register, Login, Logout. bcrypt (cost 12).
- **Sessions**: Server-side sessions (UUID-based). HttpOnly, SameSite=Lax.
- **Community**: Posts (with categories), comments, reactions (likes/dislikes).
- **Filters**: By category, "My Posts", "My Likes". Pagination.
- **Security**: CSRF, XSS escapeHtml, SQLi prepared statements, Rate Limiting.

### F02 — SSO Authentication (Google & GitHub)

- **Google OIDC**: Authorization Code + PKCE (S256) + nonce.
- **GitHub OAuth2**: Raw OAuth2 + PKCE + primary email resolution.
- **Account Linking**: Strict rejection of unverified emails (409).

### F03 — Verified Media Upload

- **UI**: File input on post creation + "Add Image" button on owned posts.
- **Streaming Intake**: busboy (5MB cap).
- **Magic Byte Detection**: file-type (no MIME spoofing).
- **Processing**: sharp decode/re-encode (destroys polyglots/RCE, strips EXIF).
- **Storage**: SHA-256 addressed, sharded, atomic writes.

### F04 — Session Hardening & Security

- **UI**: Change Password modal (session rotation after change).
- **Session Rotation**: New UUID on login/password change.
- **Global Logout**: Single-session policy.
- **UA Binding**: Session tied to User-Agent hash.
- **Timeouts**: Idle 2h / Absolute 7d.
- **Docker Hardening**: Read-only FS, tmpfs, non-root, cap_drop: ALL.
- **TLS 1.3**: Mozilla Intermediate profile.

### F05 — Moderation & Roles

- **UI**: "Report" button on every post/comment (non-owner) + mod dashboard.
- **RBAC**: `user`, `moderator`, `admin`.
- **Bootstrapping**: First registered user = admin.
- **Approval Queue**: Moderators approve/reject pending content.
- **Reports**: User reports, moderator resolves/dismisses.

### F06 — Advanced Features

- **Owned Editing**: Users edit/delete their own content.
- **Optimistic Locking**: `updated_at` check → 409 on stale edits.
- **Notifications**: Bell icon + unread count, polled.
- **Activity Logs**: Personal history of creations/edits.

### P21 — Live Database Encryption (Bonus)

- **Encryption at rest**: SQLCipher via `better-sqlite3-multiple-ciphers`.
- **Password-driven**: Set `DB_PASSWORD` in `.env` to enable.
- **Backup**: `npm run db:backup` → encrypted backup + manifest.
- **Restore**: `npm run db:restore <path>` → verified restore.
- **Tests**: `tests/f04.db-encryption.test.js` (5 tests).

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 22 (LTS) |
| Web framework | Express 5 |
| Database | SQLCipher (`better-sqlite3-multiple-ciphers`) |
| Password Hashing | `bcryptjs` (cost 12) |
| Sessions | `cookie-session` (signed) + server-side store |
| OIDC/OAuth | `openid-client` v6 |
| Multipart Intake | `busboy` v1 |
| Image Processing | `sharp` v0.35 |
| File Detection | `file-type` v16 (CJS) |
| Rate Limiting | `express-rate-limit` v8 (IPv6-safe) |
| Tests | Jest 30 + Supertest 7 |
| Container | Docker (Alpine, multi-stage, non-root) |

---

## Project Structure

```text
forum-project/
├── src/
│   ├── app.js
│   ├── config/index.js
│   ├── database/
│   │   ├── db.js               # SQLCipher-aware (P21)
│   │   ├── schema.js
│   │   └── seed.js
│   ├── auth/
│   ├── media/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   └── utils/
├── public/
│   ├── index.html              # + media input + password modal + report modal
│   ├── script.js               # + media/password/report logic
│   ├── style.css
│   └── favicon.svg
├── tests/                      # 18 suites + f04.db-encryption = 18 suites (114 tests)
├── docs/
├── scripts/
│   ├── backup-db.js            # P21
│   ├── restore-db.js           # P21
│   ├── cleanup-media.js
│   ├── inspect-db.js
│   └── seed-demo-media.js
├── server.js
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## Database Schema

Managed by `src/database/schema.js`. Key tables:

- `users`: `role` (user/mod/admin)
- `sessions`: `last_seen_at`, `user_agent_hash` (F04)
- `identities`: Google/GitHub links (F02)
- `posts` & `comments`: `status`, `updated_at` (F06)
- `reactions`: Unified likes/dislikes
- `media`: SHA-256 addressed images (F03)
- `reports`: Moderation queue (F05)
- `notifications` & `activity_logs`: F06

*(See `docs/ERD.md` for the full Mermaid diagram).*

---

## Installation & Running

### Prerequisites

- Node.js ≥ 22
- Docker (optional, required for F04 hardening and P21 demonstration)

### Local Development (with encryption)

```bash
npm install

cp .env.example .env

node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('CSRF_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('DB_PASSWORD=' + require('crypto').randomBytes(32).toString('hex'))"

# Add the three values to .env (P21 is now active)

npm run db:seed
npm run dev
```

Open `https://localhost:3000` (accept self-signed cert).

### Local Development (without encryption, for quick testing)

Leave `DB_PASSWORD=` empty in `.env`. Everything works exactly like before P21.

### Docker Setup (Recommended)

```bash
docker compose up --build -d
docker compose ps   # wait for "healthy"
```

Open `https://localhost:3000`.

> **First-time login:** First registered user becomes `admin`.

---

## P21 — Database Encryption (Bonus)

### Enable encryption

Add to `.env`:

```env
DB_PASSWORD=your-strong-password-here
```

### Backup (creates an encrypted copy)

```bash
npm run db:backup
# or with a custom path:
npm run db:backup -- ./data/backup-2026-01-01.db
```

### Restore (verify key, then replace live DB)

```bash
# Stop the server first
npm run db:restore -- ./data/backup-2026-01-01.db
```

### Verify encryption

```bash
# Raw bytes should NOT start with "SQLite format 3"
head -c 16 data/forum.db | od -c
```

---

## Running Tests

```bash
npm test             # 18 suites, 114 tests (includes P21 + Week-1 fixes)
npm test -- f04      # specific feature
npm test -- db-encryption  # P21 only
```

---

## Security Highlights

- **XSS**: Output encoding + strict CSP headers.
- **CSRF**: HMAC-signed double-submit cookies.
- **SQLi**: 100% prepared statements.
- **Session Hijacking**: User-Agent binding + IP-based rate limits.
- **Brute Force**: Per-username login limits (regardless of IP).
- **Account Takeover**: Verified email required for SSO linking.
- **RCE via Uploads**: Decode + re-encode destroys payloads.
- **DoS**: 10kb body limit, 5MB upload cap, strict timeouts.
- **Data at rest (P21)**: SQLCipher encryption with `DB_PASSWORD`.

---

## Roadmap Completion Status

| Track | Module | Status |
| --- | --- | --- |
| **P01–P20** | Preparation (base) | ✅ Complete |
| **P21** | **Live DB Encryption** | **✅ Complete** |
| **P22–P26** | Preparation (advanced) | ✅ Complete |
| **F01** | Base Forum | ✅ Complete |
| **F02** | SSO Authentication | ✅ Complete |
| **F03** | Image Upload | ✅ Complete |
| **F04** | Security & Sessions | ✅ Complete |
| **F05** | Moderation | ✅ Complete |
| **F06** | Advanced Features | ✅ Complete |
| **Total** | **Full Stack Community + P21 + Week-1 fixes** | **✅ 114/114 Tests** |
