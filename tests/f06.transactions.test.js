require('./setup');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
});

describe('P25 — Transactional Events', () => {
  let userA, tokenA, userB, tokenB, postId;

  beforeAll(async () => {
    userA = request.agent(app);
    const { token: ta } = await getCsrfFor(userA);
    tokenA = ta;
    await userA
      .post('/register')
      .set('x-csrf-token', tokenA)
      .send({ username: 'txuserA', email: 'txa@e.com', password: 'longpassword' });
    await userA
      .post('/login')
      .set('x-csrf-token', tokenA)
      .send({ username: 'txuserA', password: 'longpassword' });

    userB = request.agent(app);
    const { token: tb } = await getCsrfFor(userB);
    tokenB = tb;
    await userB
      .post('/register')
      .set('x-csrf-token', tokenB)
      .send({ username: 'txuserB', email: 'txb@e.com', password: 'longpassword' });
    await userB
      .post('/login')
      .set('x-csrf-token', tokenB)
      .send({ username: 'txuserB', password: 'longpassword' });

    const postRes = await userA
      .post('/api/posts')
      .set('x-csrf-token', tokenA)
      .send({ title: 'Transaction test post', content: 'Body', categoryIds: [1] });
    postId = postRes.body.id;
  });

  // -------------------------------------------------------------------------
  // 1. comment creation rolls back if notification fails
  // -------------------------------------------------------------------------
  test('P25-1: comment create rolls back on notification failure', async () => {
    const db = require('../src/database/db');
    const notificationModel = require('../src/models/notification.model');

    const beforeCount = db
      .prepare('SELECT COUNT(*) AS c FROM comments WHERE post_id = ?')
      .get(postId).c;

    // Mock: notification insert throws
    const originalCreate = notificationModel.create;
    notificationModel.create = () => {
      throw new Error('simulated-notification-failure');
    };

    try {
      await userB
        .post(`/api/posts/${postId}/comments`)
        .set('x-csrf-token', tokenB)
        .send({ content: 'should roll back' });
    } catch (_) {
      /* expected */
    }

    notificationModel.create = originalCreate;

    const afterCount = db
      .prepare('SELECT COUNT(*) AS c FROM comments WHERE post_id = ?')
      .get(postId).c;

    // Comment was NOT created — transaction rolled back
    expect(afterCount).toBe(beforeCount);
  });

  // -------------------------------------------------------------------------
  // 2. comment creation succeeds atomically
  // -------------------------------------------------------------------------
  test('P25-2: comment create succeeds (comment + activity + notification)', async () => {
    const db = require('../src/database/db');

    const commentCountBefore = db
      .prepare('SELECT COUNT(*) AS c FROM comments WHERE post_id = ?')
      .get(postId).c;
    const activityCountBefore = db
      .prepare("SELECT COUNT(*) AS c FROM activity_logs WHERE action = 'comment_create'")
      .get().c;
    const notifCountBefore = db
      .prepare("SELECT COUNT(*) AS c FROM notifications WHERE type = 'comment' AND user_id = ?")
      .get(1).c; // userA is id 1

    const res = await userB
      .post(`/api/posts/${postId}/comments`)
      .set('x-csrf-token', tokenB)
      .send({ content: 'should succeed' });
    expect(res.status).toBe(201);

    const commentCountAfter = db
      .prepare('SELECT COUNT(*) AS c FROM comments WHERE post_id = ?')
      .get(postId).c;
    const activityCountAfter = db
      .prepare("SELECT COUNT(*) AS c FROM activity_logs WHERE action = 'comment_create'")
      .get().c;
    const notifCountAfter = db
      .prepare("SELECT COUNT(*) AS c FROM notifications WHERE type = 'comment' AND user_id = ?")
      .get(1).c;

    expect(commentCountAfter).toBe(commentCountBefore + 1);
    expect(activityCountAfter).toBe(activityCountBefore + 1);
    expect(notifCountAfter).toBe(notifCountBefore + 1);
  });

  // -------------------------------------------------------------------------
  // 3. post creation rolls back if activity log fails
  // -------------------------------------------------------------------------
  test('P25-3: post create rolls back on activity failure', async () => {
    const db = require('../src/database/db');
    const activityModel = require('../src/models/activity.model');

    const beforeCount = db.prepare('SELECT COUNT(*) AS c FROM posts').get().c;

    const originalLog = activityModel.log;
    activityModel.log = () => {
      throw new Error('simulated-activity-failure');
    };

    try {
      await userB
        .post('/api/posts')
        .set('x-csrf-token', tokenB)
        .send({ title: 'Should roll back', content: 'Body', categoryIds: [1] });
    } catch (_) {
      /* expected */
    }

    activityModel.log = originalLog;

    const afterCount = db.prepare('SELECT COUNT(*) AS c FROM posts').get().c;
    expect(afterCount).toBe(beforeCount);
  });

  // -------------------------------------------------------------------------
  // 4. reaction (like) rolls back if notification fails
  // -------------------------------------------------------------------------
  test('P25-4: like rolls back on notification failure', async () => {
    const db = require('../src/database/db');
    const notificationModel = require('../src/models/notification.model');

    const beforeCount = db
      .prepare("SELECT COUNT(*) AS c FROM reactions WHERE target_type = 'post' AND target_id = ?")
      .get(postId).c;

    const originalCreate = notificationModel.create;
    notificationModel.create = () => {
      throw new Error('simulated-notification-failure');
    };

    try {
      await userB.post(`/api/posts/${postId}/like`).set('x-csrf-token', tokenB);
    } catch (_) {
      /* expected */
    }

    notificationModel.create = originalCreate;

    const afterCount = db
      .prepare("SELECT COUNT(*) AS c FROM reactions WHERE target_type = 'post' AND target_id = ?")
      .get(postId).c;

    // No reaction was created — rolled back
    expect(afterCount).toBe(beforeCount);
  });

  // -------------------------------------------------------------------------
  // 5. self-comment does NOT create notification (by design)
  // -------------------------------------------------------------------------
  test('P25-5: self-comment skips notification', async () => {
    const db = require('../src/database/db');

    const notifCountBefore = db
      .prepare("SELECT COUNT(*) AS c FROM notifications WHERE type = 'comment' AND user_id = ?")
      .get(1).c; // userA id=1

    // UserA comments on their own post
    await userA
      .post(`/api/posts/${postId}/comments`)
      .set('x-csrf-token', tokenA)
      .send({ content: 'self-comment' });

    const notifCountAfter = db
      .prepare("SELECT COUNT(*) AS c FROM notifications WHERE type = 'comment' AND user_id = ?")
      .get(1).c;

    // Count should be unchanged — no self-notification
    expect(notifCountAfter).toBe(notifCountBefore);
  });

  // -------------------------------------------------------------------------
  // 6. self-like does NOT create notification
  // -------------------------------------------------------------------------
  test('P25-6: self-like skips notification', async () => {
    const db = require('../src/database/db');

    const notifCountBefore = db
      .prepare("SELECT COUNT(*) AS c FROM notifications WHERE type = 'like' AND user_id = ?")
      .get(1).c;

    // UserA likes their own post
    await userA.post(`/api/posts/${postId}/like`).set('x-csrf-token', tokenA);

    const notifCountAfter = db
      .prepare("SELECT COUNT(*) AS c FROM notifications WHERE type = 'like' AND user_id = ?")
      .get(1).c;

    expect(notifCountAfter).toBe(notifCountBefore);
  });
});
