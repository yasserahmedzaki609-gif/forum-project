require('./setup');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
});

describe('F04 — Session Hardening', () => {
  const UA = 'Mozilla/5.0 TestBrowser';

  async function registerAndLogin(agent, username, ua = UA) {
    const { token } = await getCsrfFor(agent);
    await agent
      .post('/register')
      .set('x-csrf-token', token)
      .set('User-Agent', ua)
      .send({ username, email: `${username}@e.com`, password: 'longpassword' });
    await agent
      .post('/login')
      .set('x-csrf-token', token)
      .set('User-Agent', ua)
      .send({ username, password: 'longpassword' });
    return token;
  }

  test('login creates a session with user_agent_hash', async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, 'alice');

    const db = require('../src/database/db');
    const s = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1').get();
    expect(s).toBeTruthy();
    expect(s.user_agent_hash).toBeTruthy();
    expect(s.user_agent_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(s.last_seen_at).toBeTruthy();
  });

  test('login from a second device kills the first session', async () => {
    const db = require('../src/database/db');

    // Clear sessions to isolate this test
    db.prepare('DELETE FROM sessions').run();

    const deviceA = request.agent(app);
    await registerAndLogin(deviceA, 'bob', 'DeviceA/1.0');

    const countAfterA = db.prepare('SELECT COUNT(*) AS c FROM sessions').get().c;
    expect(countAfterA).toBe(1);

    const deviceB = request.agent(app);
    const { token } = await getCsrfFor(deviceB);
    await deviceB
      .post('/login')
      .set('x-csrf-token', token)
      .set('User-Agent', 'DeviceB/1.0')
      .send({ username: 'bob', password: 'longpassword' });

    const countAfterB = db.prepare('SELECT COUNT(*) AS c FROM sessions').get().c;
    expect(countAfterB).toBe(1); // old session deleted

    // Device A should now be logged out (401) - passing correct UA
    const meA = await deviceA.get('/me').set('User-Agent', 'DeviceA/1.0');
    expect(meA.status).toBe(401);

    // Device B should be logged in (200) - passing correct UA
    const meB = await deviceB.get('/me').set('User-Agent', 'DeviceB/1.0');
    expect(meB.status).toBe(200);
  });

  test('session rejected when UA changes (hijacking defense)', async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, 'carol', 'OriginalBrowser/1.0');

    // Normal request with same UA → 200
    const ok = await agent.get('/me').set('User-Agent', 'OriginalBrowser/1.0');
    expect(ok.status).toBe(200);

    // Same session, different UA → 401
    const hijacked = await agent.get('/me').set('User-Agent', 'DifferentBrowser/2.0');
    expect(hijacked.status).toBe(401);

    // Session was deleted from DB
    const db = require('../src/database/db');
    const u = db.prepare('SELECT id FROM users WHERE username = ?').get('carol');
    const s = db.prepare('SELECT id FROM sessions WHERE user_id = ?').get(u.id);
    expect(s).toBeUndefined();
  });

  test('session revoked after idle timeout', async () => {
    const config = require('../src/config');
    const originalIdle = config.session.idleTimeoutMs;

    try {
      // 2000ms > bcrypt time (~200ms) to prevent premature expiry
      config.session.idleTimeoutMs = 2000;

      const agent = request.agent(app);
      await registerAndLogin(agent, 'dave');

      const now = await agent.get('/me').set('User-Agent', UA);
      expect(now.status).toBe(200);

      // Wait > idle timeout
      await new Promise((r) => setTimeout(r, 2100));

      const afterIdle = await agent.get('/me').set('User-Agent', UA);
      expect(afterIdle.status).toBe(401);
    } finally {
      config.session.idleTimeoutMs = originalIdle;
    }
  });

  test('session revoked after absolute timeout', async () => {
    const config = require('../src/config');
    const originalAbs = config.session.absoluteTimeoutMs;

    try {
      config.session.absoluteTimeoutMs = 2000;
      const agent = request.agent(app);
      await registerAndLogin(agent, 'eve');

      await new Promise((r) => setTimeout(r, 2100));

      const afterAbs = await agent.get('/me').set('User-Agent', UA);
      expect(afterAbs.status).toBe(401);
    } finally {
      config.session.absoluteTimeoutMs = originalAbs;
    }
  });

  test('logout deletes the session from DB', async () => {
    const agent = request.agent(app);
    const token = await registerAndLogin(agent, 'frank');

    const before = await agent.get('/me').set('User-Agent', UA);
    expect(before.status).toBe(200);

    await agent.post('/logout').set('x-csrf-token', token).set('User-Agent', UA);

    const after = await agent.get('/me').set('User-Agent', UA);
    expect(after.status).toBe(401);
  });
});
