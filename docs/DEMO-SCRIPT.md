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
