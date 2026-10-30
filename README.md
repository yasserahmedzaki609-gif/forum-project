# Forum Project

[![CI](https://github.com/yasserahmedzaki609-gif/forum-project/actions/workflows/ci.yml/badge.svg)](https://github.com/yasserahmedzaki609-gif/forum-project/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-180%2F180-success)](#testing)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-ISC-lightgrey)](./LICENSE)

A production-grade community forum demonstrating **secure backend architecture**, **SSO authentication**, **verified media uploads**, and **hardened Docker deployment**.

> Built as an academy capstone project. Focused on security, testing, and maintainability rather than feature breadth.

---

## 🔗 Live Demo

> **Coming soon** — will be deployed to Render.com.
> Meanwhile, run locally in 3 commands (see [Quick Start](#quick-start)).

---

## 📸 Screenshots

<details>
<summary><b>📂 اضغط هنا لعرض لقطات المشروع (Click to view screenshots)</b></summary>
<br>

### 1. فحص صحة النظام (Docker Health)
![Docker Health](docs/images/1.jpeg)

### 2. شاشة تسجيل الدخول (Login Screen)
![Login Screen](docs/images/2.png)

### 3. لوحة الإشراف (Moderation Dashboard)
![Moderation Dashboard](docs/images/3.png)

### 4. واجهة المستخدم (User View)
![User View](docs/images/4.png)

### 5. إنشاء منشور مع صورة (Post with Image)
![Post with Image](docs/images/5.png)

### 6. أزرار التحكم للمالك (Owner Buttons)
![Owner Buttons](docs/images/6.png)

### 7. نظام التعليقات (Comments)
![Comments](docs/images/7.png)

</details>

---

## ✨ Highlights

| Area | What it demonstrates |
|---|---|
| **Auth** | Local auth (bcrypt cost 12) + Google OIDC + GitHub OAuth2 with PKCE, nonce, and state validation |
| **Sessions** | Server-side sessions (UUID), User-Agent binding, idle/absolute timeouts, rotation on password change |
| **Security** | CSRF double-submit (HMAC), strict CSP, rate limiting, SQLCipher database encryption at rest |
| **Media** | Streaming intake (busboy) → magic-byte detection → sharp re-encode → SHA-256 addressed storage |
| **Moderation** | RBAC (user/moderator/admin), approval queue, reports, append-only audit trail |
| **Infrastructure** | Multi-stage Docker, non-root (UID 1001), read-only FS, `cap_drop: ALL`, healthcheck |
| **Quality** | 180 tests across 26 suites (Jest + Supertest), 0 ESLint problems, 0 high/critical vulnerabilities |

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 |
| Web framework | Express 5 |
| Database | SQLite + SQLCipher (`better-sqlite3-multiple-ciphers`) |
| Auth | `cookie-session` + `openid-client` v6 + custom OAuth2 |
| Media | `busboy` + `sharp` + custom magic-byte detector |
| Security | `express-rate-limit`, custom CSRF, custom headers |
| Tests | Jest 30 + Supertest 7 |
| Container | Docker (Alpine, multi-stage, non-root) |

---

## 🚀 Quick Start

### Option A — Docker (recommended)

```bash
git clone https://github.com/yasserahmedzaki609-gif/forum-project.git
cd forum-project
cp .env.example .env
# Generate secrets (paste output into .env):
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('CSRF_SECRET='    + require('crypto').randomBytes(48).toString('hex'))"
docker compose up --build -d
```

Open **https://localhost:3000** (accept the self-signed certificate).

> The **first user** to register automatically becomes `admin`.

### Option B — Local Node

```bash
npm install
cp .env.example .env
# (fill SESSION_SECRET and CSRF_SECRET as above)
npm run db:seed
npm run dev
```

---

## 🧪 Testing

```bash
npm run lint      # ESLint 9 + Prettier 3 → 0 problems
npm test          # 180 tests / 26 suites
npm run verify    # lint + test (offline, deterministic)
```

The CI workflow runs `lint` + `test` on every push and pull request.

---

## 📚 Documentation

Detailed docs live in [`docs/`](./docs):

- [`ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — Layered design + request flows
- [`ERD.md`](./docs/ERD.md) — Entity-Relationship diagram (16 tables)
- [`SECURITY.md`](./docs/SECURITY.md) — Threat model, mitigations, accepted risks
- [`MEDIA-PIPELINE.md`](./docs/MEDIA-PIPELINE.md) — Upload security pipeline
- [`QA-PREPARATION.md`](./docs/QA-PREPARATION.md) — 20 anticipated review questions

---

## 📄 License

ISC — see [LICENSE](./LICENSE).
```



**هذا كل شيء!** الملف الآن جاهز، احترافي، والصور مرتبطة بأسمائها الرقمية. 
جرب هذه الخطوات البسيطة، وأخبرني بكلمة **"تم"**، وسأكون هنا لأي خطوة تالية تريدها! 🎖️🚀
