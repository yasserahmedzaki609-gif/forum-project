require('./setup');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
});

describe('D3 — List Users (admin only)', () => {
  let adminAgent, adminToken;
  let userAgent, userToken;

  beforeAll(async () => {
    adminAgent = request.agent(app);
    const { token: aT } = await getCsrfFor(adminAgent);
    adminToken = aT;
    await adminAgent.post('/register').set('x-csrf-token', adminToken)
      .send({ username: 'admin', email: 'admin@e.com', password: 'longpassword' });
    await adminAgent.post('/login').set('x-csrf-token', adminToken)
      .send({ username: 'admin', password: 'longpassword' });

    userAgent = request.agent(app);
    const { token: uT } = await getCsrfFor(userAgent);
    userToken = uT;
    await userAgent.post('/register').set('x-csrf-token', userToken)
      .send({ username: 'regular', email: 'user@e.com', password: 'longpassword' });
    await userAgent.post('/login').set('x-csrf-token', userToken)
      .send({ username: 'regular', password: 'longpassword' });
  });

  test('D3-1: admin can list all users', async () => {
    const res = await adminAgent.get('/api/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);

    // Should include both users
    const usernames = res.body.map(u => u.username).sort();
    expect(usernames).toContain('admin');
    expect(usernames).toContain('regular');
  });

  test('D3-2: list includes role and created_at', async () => {
    const res = await adminAgent.get('/api/users');
    const adminUser = res.body.find(u => u.username === 'admin');
    expect(adminUser).toHaveProperty('role');
    expect(adminUser.role).toBe('admin');
    expect(adminUser).toHaveProperty('created_at');
  });

  test('D3-3: list does NOT leak password hashes', async () => {
    const res = await adminAgent.get('/api/users');
    for (const u of res.body) {
      expect(u.password).toBeUndefined();
      expect(u.passwordHash).toBeUndefined();
    }
  });

  test('D3-4: regular user cannot list users (403)', async () => {
    const res = await userAgent.get('/api/users');
    expect(res.status).toBe(403);
  });

  test('D3-5: unauthenticated user cannot list users (401)', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  test('D3-6: admin can promote a user via PATCH /api/users/:id/role', async () => {
    const db = require('../src/database/db');
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('regular');

    const res = await adminAgent
      .patch(`/api/users/${user.id}/role`)
      .set('x-csrf-token', adminToken)
      .send({ role: 'moderator' });
    expect(res.status).toBe(200);

    // Verify
    const updated = db.prepare('SELECT role FROM users WHERE id = ?').get(user.id);
    expect(updated.role).toBe('moderator');
  });
});