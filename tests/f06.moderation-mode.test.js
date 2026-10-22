require('./setup');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
});

describe('P24 — Conditional Moderation Adapter', () => {
  let userA, tokenA;

  beforeAll(async () => {
    userA = request.agent(app);
    const { token: ta } = await getCsrfFor(userA);
    tokenA = ta;
    await userA
      .post('/register')
      .set('x-csrf-token', tokenA)
      .send({ username: 'moduser', email: 'mod@e.com', password: 'longpassword' });
    await userA
      .post('/login')
      .set('x-csrf-token', tokenA)
      .send({ username: 'moduser', password: 'longpassword' });
  });

  test('P24-A: isModerationInstalled() returns true (F05 tables exist)', () => {
    const { isModerationInstalled } = require('../src/middleware/moderationMode');
    expect(isModerationInstalled()).toBe(true);
  });

  test('P24-B: initialPostStatus() returns "pending" when F05 installed', () => {
    const { initialPostStatus } = require('../src/middleware/moderationMode');
    expect(initialPostStatus()).toBe('pending');
  });

  test('P24-C: initialCommentStatus() returns "pending" when F05 installed', () => {
    const { initialCommentStatus } = require('../src/middleware/moderationMode');
    expect(initialCommentStatus()).toBe('pending');
  });

  test('P24-D: new post via API is created as "pending"', async () => {
    const res = await userA
      .post('/api/posts')
      .set('x-csrf-token', tokenA)
      .send({ title: 'Pending by default', content: 'Body', categoryIds: [1] });
    expect(res.status).toBe(201);
    const postId = res.body.id;

    const db = require('../src/database/db');
    const post = db.prepare('SELECT status FROM posts WHERE id = ?').get(postId);
    expect(post.status).toBe('pending');
  });

  test('P24-E: pending post is hidden from public feed', async () => {
    // Create a pending post
    const create = await userA
      .post('/api/posts')
      .set('x-csrf-token', tokenA)
      .send({ title: 'Hidden pending post', content: 'Body', categoryIds: [1] });
    const postId = create.body.id;

    // Public feed should NOT include it
    const list = await request(app).get('/api/posts');
    expect(list.status).toBe(200);
    const found = list.body.data.find((p) => p.id === postId);
    expect(found).toBeUndefined();
  });

  test('P24-F: owner can see their own pending post', async () => {
    const create = await userA
      .post('/api/posts')
      .set('x-csrf-token', tokenA)
      .send({ title: 'Owner sees this', content: 'Body', categoryIds: [1] });
    const postId = create.body.id;

    // Owner can fetch it via /api/posts/:id
    const res = await userA.get(`/api/posts/${postId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(postId);
    expect(res.body.status).toBe('pending');
  });

  test('P24-G: non-owner cannot see a pending post via /api/posts/:id', async () => {
    const create = await userA
      .post('/api/posts')
      .set('x-csrf-token', tokenA)
      .send({ title: 'Hidden from others', content: 'Body', categoryIds: [1] });
    const postId = create.body.id;

    // Guest should get 404
    const res = await request(app).get(`/api/posts/${postId}`);
    expect(res.status).toBe(404);
  });

  test('P24-H: pending posts appear in the moderation queue', async () => {
    const create = await userA
      .post('/api/posts')
      .set('x-csrf-token', tokenA)
      .send({ title: 'Queue test', content: 'Body', categoryIds: [1] });
    const postId = create.body.id;

    // UserA is first user = admin, so can list the queue
    const res = await userA.get('/api/moderation/queue');
    expect(res.status).toBe(200);
    expect(res.body.posts.some((p) => p.id === postId)).toBe(true);
  });

  test('P24-I: approving a pending post makes it visible', async () => {
    const create = await userA
      .post('/api/posts')
      .set('x-csrf-token', tokenA)
      .send({ title: 'Approve me', content: 'Body', categoryIds: [1] });
    const postId = create.body.id;

    // Approve
    const patch = await userA
      .patch(`/api/moderation/posts/${postId}/status`)
      .set('x-csrf-token', tokenA)
      .send({ status: 'approved' });
    expect(patch.status).toBe(200);

    // Now visible in public feed
    const list = await request(app).get('/api/posts');
    expect(list.body.data.some((p) => p.id === postId)).toBe(true);
  });

  test('P24-J: comments are also pending by default', async () => {
    // Create + approve a post first
    const create = await userA
      .post('/api/posts')
      .set('x-csrf-token', tokenA)
      .send({ title: 'Comment target', content: 'Body', categoryIds: [1] });
    const postId = create.body.id;
    await userA
      .patch(`/api/moderation/posts/${postId}/status`)
      .set('x-csrf-token', tokenA)
      .send({ status: 'approved' });

    // Add a comment
    const c = await userA
      .post(`/api/posts/${postId}/comments`)
      .set('x-csrf-token', tokenA)
      .send({ content: 'pending comment' });
    expect(c.status).toBe(201);

    const db = require('../src/database/db');
    const comment = db.prepare('SELECT status FROM comments WHERE id = ?').get(c.body.id);
    expect(comment.status).toBe('pending');
  });

  test('P24-K: uninstalling F05 (dropping tables) changes the policy', () => {
    const db = require('../src/database/db');
    // Drop the two F05 tables — simulates running on an F01-only install
    db.exec('DROP TABLE IF EXISTS role_requests');
    db.exec('DROP TABLE IF EXISTS reports');

    // Re-require the module — cache is module-scoped, so a fresh require
    // resets it. In production, the process would restart instead.
    jest.resetModules();
    const mod = require('../src/middleware/moderationMode');

    expect(mod.isModerationInstalled()).toBe(false);
    expect(mod.initialPostStatus()).toBe('approved');
    expect(mod.initialCommentStatus()).toBe('approved');
  });
});
