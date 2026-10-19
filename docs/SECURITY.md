# Security & Threat Model

This document outlines the security posture of the Forum Project (P01–P26, F01–F06). It details the threat model, the mitigations implemented at each layer, and the architectural decisions made to ensure a production-ready application.

## Threat Model

**In Scope:**

- Network attackers (MitM, TLS stripping)
- CSRF/XSS attackers
- Credential attackers (Brute-force, Credential Stuffing)
- Session attackers (Hijacking, Fixation)
- Account Takeover (via SSO email mismatch)
- Malicious file uploads (RCE, Polyglots, Decompression bombs)
- Race Conditions (Stale updates)
- Privilege Escalation (Unauthorized moderation actions)
- DoS (Request floods, Slowloris, Body bombs)
- **Data at rest attackers (stolen DB file, backup tape)**

**Out of Scope:**

- Physical access to the host machine while running
- Compromised dependencies (mitigated by lockfiles and `npm audit`)
- Side-channel attacks (e.g., Spectre)

---

## 1. Authentication & Passwords (F01, F02)

### 1.1 Password Storage

- **bcrypt (cost 12)**: Passwords hashed using `bcryptjs`. Mitigates brute-force if DB leaks.
- **SSO-Only Users**: Password field set to unusable hash (starting with `!`). bcrypt fails on them.

### 1.2 SSO Account Linking (F02)

- **OIDC & OAuth2**: Google OIDC + PKCE + Nonce; GitHub raw OAuth2 + PKCE.
- **State Parameter**: Server-side SQLite, single-use, 10-minute TTL.
- **Account Takeover Defense**: Only link on `email_verified = true`. Unverified emails → 409.

---

## 2. Session Management (F04)

### 2.1 Session Architecture

- **Server-Side Store**: Cookie contains only an opaque, signed UUID.
- **Cookie Flags**: `HttpOnly`, `Secure` (in prod), `SameSite=Lax`.
- **User-Agent Binding**: UA hash stored; mismatch → revoke.

### 2.2 Session Lifecycle & Defense

- **Fixation**: On every login, all existing sessions deleted (`deleteAllForUser`).
- **Idle Timeout**: 2 hours.
- **Absolute Timeout**: 7 days.
- **Rotation**: `changePassword` issues a new session ID.

---

## 3. Access Control & Moderation (F05)

### 3.1 Role-Based Access Control (RBAC)

- `user`: Create content, react, report.
- `moderator`: Access queue, approve/reject, resolve reports.
- `admin`: Full access, change roles, create categories.

### 3.2 Route Guards

- `requireModerator`, `requireAdmin` at routing layer. Default deny (401/403).

### 3.3 Admin Bootstrapping

- First user in a fresh DB becomes `admin`.

### 3.4 Moderation Workflow

- **Approval Queue**: `pending` posts/comments hidden until approved.
- **Reports**: Users report content; moderators resolve/dismiss.

---

## 4. Data Integrity & Advanced Features (F06)

### 4.1 Optimistic Locking

- Client sends `updated_at`; SQL `WHERE updated_at = ?`; mismatch → **409 Conflict**.

### 4.2 Notifications & Privacy

- Bound to `user_id`. Self-actions don't notify.

---

## 5. Input Validation & Injection

### 5.1 SQL Injection (SQLi)

- 100% prepared statements.

### 5.2 Cross-Site Scripting (XSS)

- Custom `escapeHtml()` on frontend. Strict CSP.

### 5.3 CSRF

- Double-Submit Cookie + HMAC-SHA256. `timingSafeEqual`.

### 5.4 File Uploads (F03)

- Streaming bounds (5MB).
- Magic bytes via `file-type`.
- Re-encode via `sharp` (destroys polyglots, strips EXIF).

---

## 6. Infrastructure & Deployment (F04)

### 6.1 Docker Hardening

- **Non-Root**: UID 1001 (`app`). `su-exec`.
- **Read-Only FS**: `read_only: true`.
- **Resource Limits**: CPU 1.0, Memory 512MB, PIDs 200.
- **Capability Dropping**: `cap_drop: ALL` + 4 re-added.

### 6.2 Network & TLS

- **HTTPS Only**: `https.createServer`.
- **TLS 1.2/1.3 Only**: Mozilla Intermediate.
- **HSTS**: `max-age=63072000; includeSubDomains; preload`.
- **Slowloris Defense**: Tight timeouts.

### 6.3 Rate Limiting

- IPv6-safe custom key generators.
- Layered: Login (10/15min/username), General (100/15min/IP), Content (10/5min, 20/5min), Uploads (10/min).

---

## 7. Data-at-Rest Encryption (P21 — Bonus)

### 7.1 Encryption

- **SQLCipher** via `better-sqlite3-multiple-ciphers`.
- **Key management**: `DB_PASSWORD` in `.env`. Must be ≥ 16 chars in production.
- **First operation**: `PRAGMA key` is applied before any query.

### 7.2 Failure modes (by design)

- Wrong/missing password → DB open fails at startup with clear error.
- Enabling `DB_PASSWORD` on an existing plaintext DB → fails fast, no data loss.
- Backup without password → impossible (script refuses).

### 7.3 Backup

- `npm run db:backup` → encrypted backup with same password + manifest.
- `ATTACH ... KEY` + `sqlcipher_export()` — atomic and portable.

### 7.4 Restore

- `npm run db:restore <path>` — verifies key, replaces DB, removes WAL/SHM.

### 7.5 Threat coverage

- **Stolen DB file / backup**: Without the password, the file is unreadable.
- **Accidental commit**: `.gitignore` excludes `data/` and `*.db`.
- **Forensics**: Plaintext never touches disk; only encrypted pages are written.

### 7.6 Limitations (honest)

- **Server-side key**: The password lives in `.env` on the server. If the host is compromised while running, the DB can be read via the live app. (Out of scope.)
- **No HSM integration**: The password is a plain env var, not an HSM/KMS secret.
- **Backup password = DB password**: Same secret for both. Rotating it requires both backup and DB re-encryption.
- **No key rotation UI**: Rotate via `cipher_rekey` manually (see below).

### 7.7 Key rotation (manual, advanced)

```bash
# Stop the server, then:
docker compose exec forum node -e "
  const Database = require('better-sqlite3-multiple-ciphers');
  const db = new Database('/app/data/forum.db');
  db.pragma(\"key = 'OLD_PASSWORD'\");
  db.pragma(\"rekey = 'NEW_PASSWORD'\");
  db.close();
"
# Update DB_PASSWORD in .env, restart.
