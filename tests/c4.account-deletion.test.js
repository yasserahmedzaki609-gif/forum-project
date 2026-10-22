require('./setup');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
});

describe('C4 — Account Deletion', () => {
  async function setupUser(username) {
    const agent = request.agent(app);
    const { token } = await getCsrfFor(agent);
    await agent
      .post('/register')
      .set('x-csrf-token', token)
      .send({ username, email: `${username}@e.com`, password: 'longpassword' });
    await agent
      .post('/login')
      .set('x-csrf-token', token)
      .send({ username, password: 'longpassword' });
    return { agent, token };
  }

  test('C4-1: requires authentication (401 after CSRF passes)', async () => {
    // Note: DELETE without a CSRF token returns 403 (CSRF middleware runs
    // before requireAuth). To test the AUTH layer specifically, we must
    // first obtain a CSRF token — the request then fails at requireAuth
    // with 401, which is what this test verifies.
    const anonAgent = request.agent(app);
    const { token } = await getCsrfFor(anonAgent);

    const res = await anonAgent.delete('/api/users/me').set('x-csrf-token', token);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authentication/i);
  });

  test('C4-2: password user must supply currentPassword', async () => {
    const { agent, token } = await setupUser('c4a');
    const res = await agent.delete('/api/users/me').set('x-csrf-token', token).send({});
    expect(res.status).toBe(400);
  });

  test('C4-3: wrong password rejected (401)', async () => {
    const { agent, token } = await setupUser('c4b');
    const res = await agent
      .delete('/api/users/me')
      .set('x-csrf-token', token)
      .send({ password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  test('C4-4: correct password deletes account + cascades', async () => {
    const { agent, token } = await setupUser('c4c');
    const db = require('../src/database/db');

    const postRes = await agent
      .post('/api/posts')
      .set('x-csrf-token', token)
      .send({ title: 'My post', content: 'Body', categoryIds: [1] });
    const postId = postRes.body.id;

    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('c4c');

    const res = await agent
      .delete('/api/users/me')
      .set('x-csrf-token', token)
      .send({ password: 'longpassword' });
    expect(res.status).toBe(200);

    expect(db.prepare('SELECT id FROM users WHERE id = ?').get(user.id)).toBeUndefined();
    expect(db.prepare('SELECT id FROM posts WHERE id = ?').get(postId)).toBeUndefined();
    expect(db.prepare('SELECT id FROM sessions WHERE user_id = ?').get(user.id)).toBeUndefined();
  });

  test('C4-5: only admin cannot delete self (409)', async () => {
    await resetDb();
    const freshApp = require('../src/app');
    const adminAgent = request.agent(freshApp);
    const { token: adminToken } = await getCsrfFor(adminAgent);
    await adminAgent
      .post('/register')
      .set('x-csrf-token', adminToken)
      .send({ username: 'adminonly', email: 'a@e.com', password: 'longpassword' });
    await adminAgent
      .post('/login')
      .set('x-csrf-token', adminToken)
      .send({ username: 'adminonly', password: 'longpassword' });

    const res = await adminAgent
      .delete('/api/users/me')
      .set('x-csrf-token', adminToken)
      .send({ password: 'longpassword' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/only admin/i);
  });

  test('C4-6: admin CAN delete when another admin exists', async () => {
    const db = require('../src/database/db');
    const bcrypt = require('bcryptjs');
    db.prepare(
      "INSERT INTO users (username, email, password, role) VALUES ('admin2', 'a2@e.com', ?, 'admin')"
    ).run(bcrypt.hashSync('longpassword', 10));

    const freshApp = require('../src/app');
    const agent2 = request.agent(freshApp);
    const { token } = await getCsrfFor(agent2);
    await agent2
      .post('/login')
      .set('x-csrf-token', token)
      .send({ username: 'adminonly', password: 'longpassword' });

    const res = await agent2
      .delete('/api/users/me')
      .set('x-csrf-token', token)
      .send({ password: 'longpassword' });
    expect(res.status).toBe(200);

    expect(db.prepare('SELECT id FROM users WHERE username = ?').get('adminonly')).toBeUndefined();
    expect(db.prepare('SELECT id FROM users WHERE username = ?').get('admin2')).toBeDefined();
  });

  test('C4-7: audit log preserves admin actions (actor_id nullable)', async () => {
    // In this DB, admin2 exists. Create another user + post + approve.
    await resetDb();
    const freshApp = require('../src/app');

    const adminAgent = request.agent(freshApp);
    const { token: aT } = await getCsrfFor(adminAgent);
    await adminAgent
      .post('/register')
      .set('x-csrf-token', aT)
      .send({ username: 'auditadmin', email: 'aa@e.com', password: 'longpassword' });
    await adminAgent
      .post('/login')
      .set('x-csrf-token', aT)
      .send({ username: 'auditadmin', password: 'longpassword' });

    const userAgent = request.agent(freshApp);
    const { token: uT } = await getCsrfFor(userAgent);
    await userAgent
      .post('/register')
      .set('x-csrf-token', uT)
      .send({ username: 'audituser', email: 'au@e.com', password: 'longpassword' });
    await userAgent
      .post('/login')
      .set('x-csrf-token', uT)
      .send({ username: 'audituser', password: 'longpassword' });

    const db = require('../src/database/db');
    const postRes = await userAgent
      .post('/api/posts')
      .set('x-csrf-token', uT)
      .send({ title: 'Audit post', content: 'Body', categoryIds: [1] });
    await adminAgent
      .patch(`/api/moderation/posts/${postRes.body.id}/status`)
      .set('x-csrf-token', aT)
      .send({ status: 'approved' });

    // Delete the regular user
    const del = await userAgent
      .delete('/api/users/me')
      .set('x-csrf-token', uT)
      .send({ password: 'longpassword' });
    expect(del.status).toBe(200);

    // Audit log for post approval (made by admin) still exists
    const log = db
      .prepare("SELECT * FROM moderation_logs WHERE action = 'post.status_change'")
      .get();
    expect(log).toBeDefined();
    expect(log.actor_id).not.toBeNull();
  });
});
