require('./setup');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
});

describe('F05 — Moderation', () => {
  let adminAgent, adminToken;
  let userAgent, userToken;

  beforeAll(async () => {
    // 1. First user (Admin)
    adminAgent = request.agent(app);
    const { token: aT } = await getCsrfFor(adminAgent);
    adminToken = aT;
    await adminAgent
      .post('/register')
      .set('x-csrf-token', adminToken)
      .send({ username: 'admin', email: 'admin@e.com', password: 'longpassword' });
    await adminAgent
      .post('/login')
      .set('x-csrf-token', adminToken)
      .send({ username: 'admin', password: 'longpassword' });

    // 2. Second user (Regular)
    userAgent = request.agent(app);
    const { token: uT } = await getCsrfFor(userAgent);
    userToken = uT;
    await userAgent
      .post('/register')
      .set('x-csrf-token', userToken)
      .send({ username: 'user1', email: 'user1@e.com', password: 'longpassword' });
    await userAgent
      .post('/login')
      .set('x-csrf-token', userToken)
      .send({ username: 'user1', password: 'longpassword' });
  });

  test('first user is admin, second is user', async () => {
    const db = require('../src/database/db');
    const a = db.prepare('SELECT role FROM users WHERE username = ?').get('admin');
    const u = db.prepare('SELECT role FROM users WHERE username = ?').get('user1');
    expect(a.role).toBe('admin');
    expect(u.role).toBe('user');
  });

  test('user cannot access moderation queue', async () => {
    const res = await userAgent.get('/api/moderation/queue');
    expect(res.status).toBe(403);
  });

  test('admin promotes user1 to moderator', async () => {
    const db = require('../src/database/db');
    const u = db.prepare('SELECT id FROM users WHERE username = ?').get('user1');

    const res = await adminAgent
      .patch(`/api/users/${u.id}/role`)
      .set('x-csrf-token', adminToken)
      .send({ role: 'moderator' });
    expect(res.status).toBe(200);

    const updated = db.prepare('SELECT role FROM users WHERE id = ?').get(u.id);
    expect(updated.role).toBe('moderator');
  });

  test('moderator can access queue', async () => {
    const res = await userAgent.get('/api/moderation/queue');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('posts');
    expect(res.body).toHaveProperty('comments');
  });

  test('moderator approves a pending post', async () => {
    const db = require('../src/database/db');
    const postModel = require('../src/models/post.model');
    const u = db.prepare('SELECT id FROM users WHERE username = ?').get('user1');

    // Create a post with 'pending' status
    const postId = postModel.create(u.id, 'Pending title', 'Pending content', [1], 'pending');

    // Queue contains it
    const q1 = await userAgent.get('/api/moderation/queue');
    expect(q1.body.posts.some((p) => p.id === postId)).toBe(true);

    // Approve it
    const res = await userAgent
      .patch(`/api/moderation/posts/${postId}/status`)
      .set('x-csrf-token', userToken)
      .send({ status: 'approved' });
    expect(res.status).toBe(200);

    const p = db.prepare('SELECT status FROM posts WHERE id = ?').get(postId);
    expect(p.status).toBe('approved');
  });

  test('user creates report, moderator resolves it', async () => {
    const db = require('../src/database/db');
    const post = db.prepare('SELECT id FROM posts LIMIT 1').get();

    // Create
    const createRes = await userAgent
      .post('/api/reports')
      .set('x-csrf-token', userToken)
      .send({ targetType: 'post', targetId: post.id, reason: 'Spam' });
    expect(createRes.status).toBe(201);
    const reportId = createRes.body.id;

    // List
    const listRes = await userAgent.get('/api/moderation/reports');
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((r) => r.id === reportId)).toBe(true);

    // Resolve
    const resolveRes = await userAgent
      .patch(`/api/moderation/reports/${reportId}`)
      .set('x-csrf-token', userToken)
      .send({ status: 'resolved' });
    expect(resolveRes.status).toBe(200);

    const r = db.prepare('SELECT status FROM reports WHERE id = ?').get(reportId);
    expect(r.status).toBe('resolved');
  });
});
