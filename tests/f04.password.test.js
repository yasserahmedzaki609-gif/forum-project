require('./setup');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
});

describe('F04 — Password Change', () => {
  async function setupUser(username) {
    const agent = request.agent(app);
    const { token } = await getCsrfFor(agent);
    await agent.post('/register')
      .set('x-csrf-token', token)
      .send({ username, email: `${username}@e.com`, password: 'oldpassword123' });
    await agent.post('/login')
      .set('x-csrf-token', token)
      .send({ username, password: 'oldpassword123' });
    return { agent, token };
  }

  test('requires authentication', async () => {
    const anon = request.agent(app);
    const { token } = await getCsrfFor(anon);
    const res = await anon.post('/api/users/me/password')
      .set('x-csrf-token', token)
      .send({ currentPassword: 'oldpassword123', newPassword: 'newpassword456' });
    expect(res.status).toBe(401);
  });

  test('requires correct current password', async () => {
    const { agent, token } = await setupUser('pwtest1');
    const res = await agent.post('/api/users/me/password')
      .set('x-csrf-token', token)
      .send({ currentPassword: 'wrongpassword', newPassword: 'newpassword456' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/current password/i);
  });

  test('rejects new password shorter than 8 chars', async () => {
    const { agent, token } = await setupUser('pwtest2');
    const res = await agent.post('/api/users/me/password')
      .set('x-csrf-token', token)
      .send({ currentPassword: 'oldpassword123', newPassword: 'short' });
    expect(res.status).toBe(400);
  });

  test('rejects new password equal to current', async () => {
    const { agent, token } = await setupUser('pwtest3');
    const res = await agent.post('/api/users/me/password')
      .set('x-csrf-token', token)
      .send({ currentPassword: 'oldpassword123', newPassword: 'oldpassword123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/differ/i);
  });

  test('successful change rotates session and keeps user logged in', async () => {
    const { agent, token } = await setupUser('pwtest4');

    const db = require('../src/database/db');
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('pwtest4');
    const oldSession = db.prepare('SELECT id FROM sessions WHERE user_id = ?').get(user.id);
    expect(oldSession).toBeTruthy();

    const res = await agent.post('/api/users/me/password')
      .set('x-csrf-token', token)
      .send({ currentPassword: 'oldpassword123', newPassword: 'newpassword789' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const oldStill = db.prepare('SELECT id FROM sessions WHERE id = ?').get(oldSession.id);
    expect(oldStill).toBeUndefined();

    const newSession = db.prepare('SELECT id FROM sessions WHERE user_id = ?').get(user.id);
    expect(newSession).toBeTruthy();
    expect(newSession.id).not.toBe(oldSession.id);

    const me = await agent.get('/me');
    expect(me.status).toBe(200);
  });

  test('old password no longer works after change', async () => {
    const { agent, token } = await setupUser('pwtest5');

    await agent.post('/api/users/me/password')
      .set('x-csrf-token', token)
      .send({ currentPassword: 'oldpassword123', newPassword: 'newpassword789' });
    await agent.post('/logout').set('x-csrf-token', token);

    const freshAgent = request.agent(app);
    const { token: t2 } = await getCsrfFor(freshAgent);
    const oldLogin = await freshAgent.post('/login')
      .set('x-csrf-token', t2)
      .send({ username: 'pwtest5', password: 'oldpassword123' });
    expect(oldLogin.status).toBe(401);

    const newLogin = await freshAgent.post('/login')
      .set('x-csrf-token', t2)
      .send({ username: 'pwtest5', password: 'newpassword789' });
    expect(newLogin.status).toBe(200);
  });

  test('B2: changePassword kills sessions on OTHER devices', async () => {
    // Register a user and log in from device A
    const deviceA = request.agent(app);
    const { token: tokenA } = await getCsrfFor(deviceA);
    await deviceA.post('/register')
      .set('x-csrf-token', tokenA)
      .send({ username: 'b2user', email: 'b2@e.com', password: 'oldpassword123' });
    await deviceA.post('/login')
      .set('x-csrf-token', tokenA)
      .send({ username: 'b2user', password: 'oldpassword123' });

    // Log in from device B (kills A due to single-session policy, so let's be careful)
    const deviceB = request.agent(app);
    const { token: tokenB } = await getCsrfFor(deviceB);
    await deviceB.post('/login')
      .set('x-csrf-token', tokenB)
      .send({ username: 'b2user', password: 'oldpassword123' });

    // At this point, only device B has a valid session.
    // Device A is already logged out due to the single-session policy in login().
    // We need a different setup to test multi-session behavior.

    // Actually, the existing single-session policy means only one session exists at a time.
    // So the specific vulnerability of "other device stays logged in" can only manifest
    // if there were multiple sessions. Let's manually create a second session for the user
    // to simulate a scenario where two sessions exist.

    const db = require('../src/database/db');
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('b2user');
    const sessionModel = require('../src/models/session.model');
    const config = require('../src/config');

    // Manually create a second session (simulating an old device that was never logged out)
    const extraSession = sessionModel.create(
      user.id,
      config.session.maxAgeMs,
      null  // no UA binding
    );

    const countBefore = db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?').get(user.id).c;
    expect(countBefore).toBeGreaterThanOrEqual(2);

    // Now change password from device B
    const res = await deviceB.post('/api/users/me/password')
      .set('x-csrf-token', tokenB)
      .send({ currentPassword: 'oldpassword123', newPassword: 'newpassword456' });
    expect(res.status).toBe(200);

    // Verify only ONE session remains (the newly created one for device B)
    const countAfter = db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?').get(user.id).c;
    expect(countAfter).toBe(1);

    // Verify the manually created extra session is gone
    const extraStill = db.prepare('SELECT id FROM sessions WHERE id = ?').get(extraSession.id);
    expect(extraStill).toBeUndefined();
  });
});