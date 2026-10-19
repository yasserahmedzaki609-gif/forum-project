# Presentation Notes & Q&A

## Key Talking Points

### Introduction

"Today I will present my Forum Project, which covers the complete Academy Roadmap from F01 to F06. I didn't just build a standard forum; I built a hardened, production-ready application with 107 passing tests, zero security vulnerabilities, and SQLCipher database encryption at rest."

### Architecture

"I chose a layered architecture. When I write a controller, I only care about HTTP. When I write a model, I only care about SQL. This makes testing easier and the code cleaner."

### F02 (SSO)

"During SSO, the biggest risk is Account Takeover. If I login with Google using an email that already exists locally, the system checks if the Google email is verified. If not, it rejects the login. This stops attackers."

### F03 (Media Pipeline)

"File uploads are a massive attack vector. We use `sharp` to decode and re-encode the image. This destroys any embedded PHP or JS payloads (polyglots). We also strip EXIF data for privacy."

### F04 (Security & Docker)

"Sessions are protected with User-Agent binding. If a hacker steals a cookie and uses it on another browser, the session is instantly revoked. For Docker, I dropped all Linux capabilities (`cap_drop: ALL`) and made the root filesystem read-only. The app runs as a non-root user."

### F06 (Advanced)

"To prevent the 'Lost Update' problem, I implemented Optimistic Locking. When editing, the server checks the `updated_at` timestamp. If someone else changed it in the meantime, the server returns a 409 Conflict."

### P21 (Live DB Encryption)

"Beyond the roadmap, I implemented P21: the SQLite database is encrypted at rest with SQLCipher. This means if an attacker steals the `.db` file, they cannot read a single row without the `DB_PASSWORD`. I also built `db:backup` and `db:restore` scripts, and a dedicated test suite that proves a wrong password is rejected at open time."

---

## Top 10 Q&A

**1. Why did you use SQLite instead of PostgreSQL?**
"SQLite is the requirement. It's perfect for embedded databases. With WAL mode enabled, it handles concurrent reads well. Plus, it simplifies Docker deployment."

**2. How did you handle CSRF?**
"I used the Double-Submit Cookie pattern. A token is signed with HMAC-SHA256 and sent in a cookie. Unsafe methods (POST/PUT/DELETE) must return this token in a header. We use `timingSafeEqual` to compare them."

**3. How do you know a file is actually an image?**
"We never trust the file extension or the `Content-Type` header. We use `file-type` to check the magic bytes. Then we pass it to `sharp` to decode it. If it's not a real image, `sharp` throws an error."

**4. How are you handling password security?**
"We use `bcrypt` with a cost factor of 12. For SSO-only users, their password is set to a random string starting with `!`, which makes local login impossible. Passwords are never logged or returned in API responses."

**5. How do you handle database migrations?**
"I built a custom migration runner. Each migration is a numbered script. We have a `schema_migrations` table. When the server starts, it runs any pending migrations inside a transaction."

**6. Why did you add `su-exec` to the Dockerfile?**
"Because Docker volumes are created as root. The entrypoint script runs as root to fix volume permissions, then uses `su-exec` to drop privileges and run the Node.js app as UID 1001."

**7. How does the first user become admin?**
"In the `register` controller, we check `userModel.countAll()`. If it's `0`, we assign the `role` as `admin`. This is a bootstrapping mechanism."

**8. What happens if I try to edit a post after another user edited it?**
"The server returns a `409 Conflict`. We use the `updated_at` column. The client sends the timestamp they loaded. The SQL update includes `WHERE updated_at = ?`. If it doesn't match, the update fails."

**9. Why use `busboy` instead of `multer`?**
"`busboy` streams the file. `multer` often buffers the whole file into memory by default. With a 5MB limit, streaming is much safer and prevents memory exhaustion DoS attacks."

**10. Are there any frontend frameworks?**
"No. The Roadmap strictly forbids React, Vue, etc. I built the UI using Vanilla JavaScript and DOM manipulation. I also wrote a custom `escapeHtml` function to prevent XSS."
