require('./setup');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
});

describe('C5 — Session last_seen_at Throttling', () => {
  let agent, token, sessionId;

  beforeAll(async () => {
    agent = request.agent(app);
    const { token: t } = await getCsrfFor(agent);
    token = t;
    await agent
      .post('/register')
      .set('x-csrf-token', token)
      .send({ username: 'c5user', email: 'c5@e.com', password: 'longpassword' });
    await agent
      .post('/login')
      .set('x-csrf-token', token)
      .send({ username: 'c5user', password: 'longpassword' });

    const db = require('../src/database/db');
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('c5user');
    const session = db.prepare('SELECT id FROM sessions WHERE user_id = ?').get(user.id);
    sessionId = session.id;
  });

  test('C5-1: touch is throttled — repeated requests do not write', async () => {
    const db = require('../src/database/db');
    const config = require('../src/config');

    // Same isolation reason as C5-2: don't let a short idle timeout from
    // .env accidentally expire the session mid-test.
    const originalIdle = config.session.idleTimeoutMs;
    config.session.idleTimeoutMs = 60 * 60 * 1000; // 1 hour

    try {
      const before = db.prepare('SELECT last_seen_at FROM sessions WHERE id = ?').get(sessionId);
      const beforeTs = before.last_seen_at;

      for (let i = 0; i < 5; i++) {
        const res = await agent.get('/me');
        expect(res.status).toBe(200);
      }

      const after = db.prepare('SELECT last_seen_at FROM sessions WHERE id = ?').get(sessionId);
      expect(after.last_seen_at).toBe(beforeTs);
    } finally {
      config.session.idleTimeoutMs = originalIdle;
    }
  });

  test('C5-2: touch fires after throttle window elapses', async () => {
    const db = require('../src/database/db');
    const config = require('../src/config');

    // FIX: this test verifies the throttle window (> 5 min → touch), NOT the
    // idle timeout. Since .env can set SESSION_IDLE_TIMEOUT_MIN=1 (very short
    // for dev), we must isolate idle timeout here — otherwise setting
    // last_seen_at to 10 min ago triggers idle expiry and we get 401.
    // Use 1 hour idle so only the 5-min throttle matters.
    const originalIdle = config.session.idleTimeoutMs;
    config.session.idleTimeoutMs = 60 * 60 * 1000; // 1 hour

    try {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19);
      db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(tenMinAgo, sessionId);

      const before = db.prepare('SELECT last_seen_at FROM sessions WHERE id = ?').get(sessionId);
      expect(before.last_seen_at).toBe(tenMinAgo);

      // Hit /me — should trigger a touch (10 min > 5 min throttle)
      const res = await agent.get('/me');
      expect(res.status).toBe(200);

      const after = db.prepare('SELECT last_seen_at FROM sessions WHERE id = ?').get(sessionId);
      expect(after.last_seen_at).not.toBe(tenMinAgo);

      // Verify the new value is recent (within 10 seconds)
      const parsed = new Date(
        after.last_seen_at.includes('T')
          ? after.last_seen_at
          : after.last_seen_at.replace(' ', 'T') + 'Z'
      );
      expect(Date.now() - parsed.getTime()).toBeLessThan(10000);
    } finally {
      config.session.idleTimeoutMs = originalIdle;
    }
  });

  test('C5-3: idle timeout still enforced (touching does not extend)', async () => {
    const config = require('../src/config');
    const originalIdle = config.session.idleTimeoutMs;

    try {
      // Set idle to 1 second
      config.session.idleTimeoutMs = 1000;

      // Force last_seen_at to 2 seconds ago (past idle)
      const db = require('../src/database/db');
      const twoSecAgo = new Date(Date.now() - 2000).toISOString();
      db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(twoSecAgo, sessionId);

      // Request should fail with 401 (session expired due to idle timeout)
      const res = await agent.get('/me');
      expect(res.status).toBe(401);

      // Session deleted
      const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
      expect(session).toBeUndefined();
    } finally {
      config.session.idleTimeoutMs = originalIdle;
    }
  });
});
