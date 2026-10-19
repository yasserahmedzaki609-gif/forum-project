
# Live Demo Script (7 Minutes)

## Setup (Before you start)

Open two terminal windows:

- Terminal 1: Run `docker compose up -d` (Ensure it's healthy).
- Terminal 2: Keep it open for Docker commands.
- Browser 1: Normal window.
- Browser 2: Incognito (Private) window.

## Step 1: Admin Bootstrapping (1 min)

1. Go to `https://localhost:3000` in Browser 1.
2. Register: `admin1` / `admin@test.com` / `password123`.
3. Look at the top: `Welcome, admin1! (admin)`.
4. Scroll down: Point out the **Moderation Dashboard**.

## Step 2: Create Content & Media (1 min)

1. Create a post: "Hello World" in "General".
2. **Choose an image before publishing** → point out the new **file input**.
3. Publish. The image appears below the post (F03 demo).
4. Point out the **Edit**, **Delete**, and **Add Image** buttons (owner-only).

## Step 3: Change Password (30 sec — F04)

1. Click **Change Password** (new orange button next to Logout).
2. Enter `password123` as current and `newpassword123` as new.
3. Save. You stay logged in (session rotation shown in logs).
4. (Optional) Open the DB with the wrong key to prove encryption fails.

## Step 4: Notifications & SSO (1 min)

1. Open Browser 2 (Incognito).
2. Register: `user1` / `user1@test.com` / `password123`.
3. Comment on `admin1`'s post: "Nice post!".
4. Go back to Browser 1 (admin1).
5. Click the Bell icon (🔔). Point out the unread notification.

## Step 5: Report Content (30 sec — F05)

1. In Browser 2 (as user1), click **Report** on admin1's post.
2. Enter: "Spam content" → Submit.
3. In Browser 1 (as admin1), scroll to **Moderation Dashboard** → **Open Reports** shows the new report.
4. Click **Resolve**.

## Step 6: Optimistic Locking / Stale Update (1 min)

1. In Browser 1, click Edit on the post. Change the title. Click Save.
2. In Browser 2 (as user1), try to edit the same post via API:

   ```bash
   curl -k -X PUT https://localhost:3000/api/posts/1 \
     -H "Content-Type: application/json" \
     -H "x-csrf-token: <token>" \
     -b "forum_session=<cookie>" \
     -d '{"title":"Hijacked","content":"Nope","categoryIds":[1],"updatedAt":"<old>"}'
   ```

   Response: `409 Conflict`.
3. *Explanation*: "The `updated_at` timestamp changed → the server refuses to overwrite."

## Step 7: Docker Security Proof (30 sec)

```bash
docker compose exec forum whoami
# Output: app

docker compose exec forum sh -c "touch /app/test.txt"
# Output: touch: /app/test.txt: Read-only file system

docker compose exec forum id
# Output: uid=1001(app) gid=1001(app) groups=1001(app)
```

## Step 8: P21 — Database Encryption Proof (1 min)

### 8.1 Prove the DB is encrypted

In Terminal 2:

```bash
# Peek at the first bytes of the DB file — should NOT show SQLite header
docker compose exec forum sh -c "head -c 16 /app/data/forum.db | od -c"
# Output: random-looking bytes (SQLCipher header, not "SQLite format 3")
```

### 8.2 Prove wrong password fails

```bash
# Try to open the DB without the password
docker compose exec forum node -e "
  const Database = require('better-sqlite3-multiple-ciphers');
  const db = new Database('/app/data/forum.db');
  try {
    db.prepare('SELECT count(*) FROM users').get();
    console.log('OPENED — encryption is NOT working!');
  } catch (err) {
    console.log('REJECTED:', err.message);
  }
"
# Output: REJECTED: file is not a database (or similar)
```

### 8.3 Prove backup/restore works

```bash
docker compose exec forum npm run db:backup
# Output: ✅ Backup created: /app/data/backup-XXXX.db

docker compose exec forum ls -la /app/data/
# Shows forum.db + backup-XXXX.db + manifest
```

## Conclusion

**Total runtime**: ~7 minutes.

You now have a demonstration that covers:

- ✅ F01 (Base Forum + posts + comments)
- ✅ F02 (Google + GitHub SSO)
- ✅ F03 (Image upload UI + pipeline)
- ✅ F04 (Password change + session rotation)
- ✅ F05 (Report UI + moderation queue)
- ✅ F06 (Optimistic locking + notifications)
- ✅ **P21 (SQLCipher encryption + backup)**
