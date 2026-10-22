require('./setup');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
});

describe('P23 — Role Requests', () => {
  let adminAgent, adminToken;
  let userAgent, userToken;

  beforeAll(async () => {
    // First user becomes admin
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

    // Second user is regular
    userAgent = request.agent(app);
    const { token: uT } = await getCsrfFor(userAgent);
    userToken = uT;
    await userAgent
      .post('/register')
      .set('x-csrf-token', userToken)
      .send({ username: 'regularuser', email: 'user@e.com', password: 'longpassword' });
    await userAgent
      .post('/login')
      .set('x-csrf-token', userToken)
      .send({ username: 'regularuser', password: 'longpassword' });
  });

  test('regular user can request moderator', async () => {
    const res = await userAgent
      .post('/api/roles/request')
      .set('x-csrf-token', userToken)
      .send({ requestedRole: 'moderator', reason: 'I want to help moderate the forum' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeGreaterThan(0);
    expect(res.body.status).toBe('pending');
  });

  test('cannot create duplicate pending request', async () => {
    const res = await userAgent
      .post('/api/roles/request')
      .set('x-csrf-token', userToken)
      .send({ requestedRole: 'moderator', reason: 'Second attempt' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/pending/i);
  });

  test('regular user cannot request admin directly', async () => {
    // Use a fresh agent so no pending request interferes
    const freshAgent = request.agent(app);
    const { token } = await getCsrfFor(freshAgent);
    await freshAgent
      .post('/register')
      .set('x-csrf-token', token)
      .send({ username: 'wannabe', email: 'w@e.com', password: 'longpassword' });
    await freshAgent
      .post('/login')
      .set('x-csrf-token', token)
      .send({ username: 'wannabe', password: 'longpassword' });

    const res = await freshAgent
      .post('/api/roles/request')
      .set('x-csrf-token', token)
      .send({ requestedRole: 'admin', reason: 'I want to be admin' });
    expect(res.status).toBe(403);
  });

  test('validates requestedRole value', async () => {
    const freshAgent = request.agent(app);
    const { token } = await getCsrfFor(freshAgent);
    await freshAgent
      .post('/register')
      .set('x-csrf-token', token)
      .send({ username: 'invalidrole', email: 'i@e.com', password: 'longpassword' });
    await freshAgent
      .post('/login')
      .set('x-csrf-token', token)
      .send({ username: 'invalidrole', password: 'longpassword' });

    const res = await freshAgent
      .post('/api/roles/request')
      .set('x-csrf-token', token)
      .send({ requestedRole: 'superadmin', reason: 'Invalid role test here' });
    expect(res.status).toBe(400);
  });

  test('validates reason length (min 10 chars)', async () => {
    const freshAgent = request.agent(app);
    const { token } = await getCsrfFor(freshAgent);
    await freshAgent
      .post('/register')
      .set('x-csrf-token', token)
      .send({ username: 'shortreason', email: 's@e.com', password: 'longpassword' });
    await freshAgent
      .post('/login')
      .set('x-csrf-token', token)
      .send({ username: 'shortreason', password: 'longpassword' });

    const res = await freshAgent
      .post('/api/roles/request')
      .set('x-csrf-token', token)
      .send({ requestedRole: 'moderator', reason: 'short' });
    expect(res.status).toBe(400);
  });

  test('regular user cannot access moderation queue', async () => {
    const res = await userAgent.get('/api/moderation/role-requests');
    expect(res.status).toBe(403);
  });

  test('admin can list pending requests', async () => {
    const res = await adminAgent.get('/api/moderation/role-requests');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('requester_username');
    expect(res.body[0].status).toBe('pending');
  });

  test('admin approves request → user role changed', async () => {
    // Find the pending request for regularuser
    const list = await adminAgent.get('/api/moderation/role-requests');
    const request1 = list.body.find((r) => r.requester_username === 'regularuser');
    expect(request1).toBeDefined();

    const res = await adminAgent
      .patch(`/api/moderation/role-requests/${request1.id}`)
      .set('x-csrf-token', adminToken)
      .send({ action: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.action).toBe('approve');

    // Verify role changed in DB
    const db = require('../src/database/db');
    const user = db.prepare('SELECT role FROM users WHERE username = ?').get('regularuser');
    expect(user.role).toBe('moderator');
  });

  test('cannot review already-approved request', async () => {
    const list = await adminAgent.get('/api/moderation/role-requests');
    // Now empty (the one was approved). So we need a fresh request.

    // Approve action on the same id should now fail because it's no longer pending
    // We test via checking the request status in DB
    const db = require('../src/database/db');
    const approved = db
      .prepare("SELECT id FROM role_requests WHERE status = 'approved' LIMIT 1")
      .get();
    expect(approved).toBeDefined();

    const res = await adminAgent
      .patch(`/api/moderation/role-requests/${approved.id}`)
      .set('x-csrf-token', adminToken)
      .send({ action: 'approve' });
    expect(res.status).toBe(409);
  });

  test('admin can reject a request', async () => {
    // Create a new user + request
    const newAgent = request.agent(app);
    const { token } = await getCsrfFor(newAgent);
    await newAgent
      .post('/register')
      .set('x-csrf-token', token)
      .send({ username: 'rejectme', email: 'rj@e.com', password: 'longpassword' });
    await newAgent
      .post('/login')
      .set('x-csrf-token', token)
      .send({ username: 'rejectme', password: 'longpassword' });

    const create = await newAgent
      .post('/api/roles/request')
      .set('x-csrf-token', token)
      .send({ requestedRole: 'moderator', reason: 'Please reject this request' });
    expect(create.status).toBe(201);

    const res = await adminAgent
      .patch(`/api/moderation/role-requests/${create.body.id}`)
      .set('x-csrf-token', adminToken)
      .send({ action: 'reject' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify role unchanged
    const db = require('../src/database/db');
    const user = db.prepare('SELECT role FROM users WHERE username = ?').get('rejectme');
    expect(user.role).toBe('user');
  });

  test('user can view their own request history', async () => {
    const res = await userAgent.get('/api/roles/me');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // Should include reviewer info
    expect(res.body[0]).toHaveProperty('reviewer_username');
  });
});
