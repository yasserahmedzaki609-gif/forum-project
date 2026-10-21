require('./setup');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
});

describe('C1 — Moderation Audit Trail', () => {
  let adminAgent, adminToken;
  let modAgent, modToken;
  let userAgent, userToken;

  beforeAll(async () => {
    // Admin (first user)
    adminAgent = request.agent(app);
    const { token: aT } = await getCsrfFor(adminAgent);
    adminToken = aT;
    await adminAgent.post('/register').set('x-csrf-token', adminToken)
      .send({ username: 'admin', email: 'admin@e.com', password: 'longpassword' });
    await adminAgent.post('/login').set('x-csrf-token', adminToken)
      .send({ username: 'admin', password: 'longpassword' });

    // Moderator (second user)
    modAgent = request.agent(app);
    const { token: mT } = await getCsrfFor(modAgent);
    modToken = mT;
    await modAgent.post('/register').set('x-csrf-token', modToken)
      .send({ username: 'mod', email: 'mod@e.com', password: 'longpassword' });
    await modAgent.post('/login').set('x-csrf-token', modToken)
      .send({ username: 'mod', password: 'longpassword' });

    // Promote mod to moderator
    const db = require('../src/database/db');
    const modUser = db.prepare('SELECT id FROM users WHERE username = ?').get('mod');
    await adminAgent.patch(`/api/users/${modUser.id}/role`)
      .set('x-csrf-token', adminToken)
      .send({ role: 'moderator' });

    // Regular user
    userAgent = request.agent(app);
    const { token: uT } = await getCsrfFor(userAgent);
    userToken = uT;
    await userAgent.post('/register').set('x-csrf-token', userToken)
      .send({ username: 'regular', email: 'reg@e.com', password: 'longpassword' });
    await userAgent.post('/login').set('x-csrf-token', userToken)
      .send({ username: 'regular', password: 'longpassword' });
  });

  test('C1-1: post status change creates a log entry', async () => {
    // Create post (as regular user)
    const p = await userAgent.post('/api/posts').set('x-csrf-token', userToken)
      .send({ title: 'Audit test', content: 'Body', categoryIds: [1] });
    const postId = p.body.id;

    // Approve as mod
    const res = await modAgent
      .patch(`/api/moderation/posts/${postId}/status`)
      .set('x-csrf-token', modToken)
      .send({ status: 'approved' });
    expect(res.status).toBe(200);

    // Verify log entry exists
    const db = require('../src/database/db');
    const log = db.prepare(
      "SELECT * FROM moderation_logs WHERE action = 'post.status_change' AND target_id = ?"
    ).get(postId);
    expect(log).toBeDefined();
    expect(log.target_type).toBe('post');
    expect(log.metadata).toContain('approved');
    expect(log.metadata).toContain('pending');
  });

  test('C1-2: comment status change creates a log entry', async () => {
    // Create + approve post
    const p = await userAgent.post('/api/posts').set('x-csrf-token', userToken)
      .send({ title: 'Comment target', content: 'Body', categoryIds: [1] });
    const postId = p.body.id;
    await modAgent.patch(`/api/moderation/posts/${postId}/status`)
      .set('x-csrf-token', modToken).send({ status: 'approved' });

    // Create comment
    const c = await userAgent.post(`/api/posts/${postId}/comments`)
      .set('x-csrf-token', userToken)
      .send({ content: 'Audit comment' });
    const commentId = c.body.id;

    // Approve comment as mod
    await modAgent.patch(`/api/moderation/comments/${commentId}/status`)
      .set('x-csrf-token', modToken).send({ status: 'approved' });

    const db = require('../src/database/db');
    const log = db.prepare(
      "SELECT * FROM moderation_logs WHERE action = 'comment.status_change' AND target_id = ?"
    ).get(commentId);
    expect(log).toBeDefined();
  });

  test('C1-3: role change creates a log entry', async () => {
    const db = require('../src/database/db');
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('regular');

    await adminAgent.patch(`/api/users/${user.id}/role`)
      .set('x-csrf-token', adminToken)
      .send({ role: 'moderator' });

    const log = db.prepare(
      "SELECT * FROM moderation_logs WHERE action = 'user.role_change' AND target_id = ?"
    ).get(user.id);
    expect(log).toBeDefined();
    expect(log.metadata).toContain('moderator');
  });

  test('C1-4: report status change creates a log entry', async () => {
    const p = await userAgent.post('/api/posts').set('x-csrf-token', userToken)
      .send({ title: 'Report target', content: 'Body', categoryIds: [1] });
    const postId = p.body.id;
    await modAgent.patch(`/api/moderation/posts/${postId}/status`)
      .set('x-csrf-token', modToken).send({ status: 'approved' });

    // Create report
    const r = await userAgent.post('/api/reports')
      .set('x-csrf-token', userToken)
      .send({ targetType: 'post', targetId: postId, reason: 'Spam content' });
    const reportId = r.body.id;

    // Resolve as mod
    await modAgent.patch(`/api/moderation/reports/${reportId}`)
      .set('x-csrf-token', modToken).send({ status: 'resolved' });

    const db = require('../src/database/db');
    const log = db.prepare(
      "SELECT * FROM moderation_logs WHERE action = 'report.status_change' AND target_id = ?"
    ).get(reportId);
    expect(log).toBeDefined();
  });

  test('C1-5: role request review creates a log entry', async () => {
    // Create a fresh user requesting moderator
    const reqAgent = request.agent(app);
    const { token: rt } = await getCsrfFor(reqAgent);
    await reqAgent.post('/register').set('x-csrf-token', rt)
      .send({ username: 'requester', email: 'req@e.com', password: 'longpassword' });
    await reqAgent.post('/login').set('x-csrf-token', rt)
      .send({ username: 'requester', password: 'longpassword' });

    const rq = await reqAgent.post('/api/roles/request')
      .set('x-csrf-token', rt)
      .send({ requestedRole: 'moderator', reason: 'I want to moderate this forum' });
    const requestId = rq.body.id;

    // Admin approves
    await adminAgent.patch(`/api/moderation/role-requests/${requestId}`)
      .set('x-csrf-token', adminToken)
      .send({ action: 'approve' });

    const db = require('../src/database/db');
    const log = db.prepare(
      "SELECT * FROM moderation_logs WHERE action = 'role_request.approve' AND target_id = ?"
    ).get(requestId);
    expect(log).toBeDefined();
  });

  test('C1-6: admin can list audit log', async () => {
    const res = await adminAgent.get('/api/moderation/audit-log');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // Should include actor username via JOIN
    expect(res.body[0]).toHaveProperty('actor_username');
  });

  test('C1-7: non-admin cannot access audit log', async () => {
    const res = await userAgent.get('/api/moderation/audit-log');
    expect(res.status).toBe(403);
  });

  test('C1-8: moderator cannot access audit log (admin only)', async () => {
    const res = await modAgent.get('/api/moderation/audit-log');
    expect(res.status).toBe(403);
  });

  test('C1-9: audit log can be filtered by target', async () => {
    const db = require('../src/database/db');
    const targetPost = db.prepare(
      "SELECT target_id FROM moderation_logs WHERE action = 'post.status_change' LIMIT 1"
    ).get();

    const res = await adminAgent.get(
      `/api/moderation/audit-log?target_type=post&target_id=${targetPost.target_id}`
    );
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every(l => l.target_id === targetPost.target_id)).toBe(true);
  });

  test('C1-10: audit log is append-only (no update/delete endpoints)', async () => {
    // We don't test the absence of routes directly, but we can verify that
    // no moderation_logs row ever changes. As a proxy, verify that adding
    // a second status change produces a NEW row, not an update.
    const db = require('../src/database/db');

    const p = await userAgent.post('/api/posts').set('x-csrf-token', userToken)
      .send({ title: 'Double change', content: 'Body', categoryIds: [1] });
    const postId = p.body.id;

    // Approve
    await modAgent.patch(`/api/moderation/posts/${postId}/status`)
      .set('x-csrf-token', modToken).send({ status: 'approved' });
    // Reject
    await modAgent.patch(`/api/moderation/posts/${postId}/status`)
      .set('x-csrf-token', modToken).send({ status: 'rejected' });

    const logs = db.prepare(
      "SELECT * FROM moderation_logs WHERE action = 'post.status_change' AND target_id = ?"
    ).all(postId);
    // Two separate rows, not one updated row
    expect(logs.length).toBe(2);
  });
});