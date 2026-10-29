require('./setup');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
});

describe('C3 — Identities Endpoints', () => {
  // Seed DB with SSO identities for testing (does not go through OAuth flow)
  function addIdentity(userId, provider, providerUserId, email) {
    const db = require('../src/database/db');
    db.prepare(
      `
      INSERT INTO identities (user_id, provider, provider_user_id, email)
      VALUES (?, ?, ?, ?)
    `
    ).run(userId, provider, providerUserId, email);
  }

  function createUser(username, email, password) {
    const db = require('../src/database/db');
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync(password, 10);
    const info = db
      .prepare("INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, 'user')")
      .run(username, email, hash);
    return info.lastInsertRowid;
  }

  async function loginAs(agent, username, password) {
    const { token } = await getCsrfFor(agent);
    await agent.post('/login').set('x-csrf-token', token).send({ username, password });
    return token;
  }

  test('C3-1: GET requires authentication', async () => {
    const res = await request(app).get('/api/users/me/identities');
    expect(res.status).toBe(401);
  });

  test('C3-2: GET returns empty list for user with no SSO links', async () => {
    createUser('localuser', 'local@e.com', 'longpassword');
    const agent = request.agent(app);
    const _token = await loginAs(agent, 'localuser', 'longpassword');

    const res = await agent.get('/api/users/me/identities');
    expect(res.status).toBe(200);
    expect(res.body.identities).toEqual([]);
    expect(res.body.hasPassword).toBe(true);
    expect(res.body.canUnlink).toBe(true); // has password → can always unlink
  });

  test('C3-3: GET returns linked providers for user with SSO', async () => {
    const userId = createUser('ssouser', 'sso@e.com', 'longpassword');
    addIdentity(userId, 'github', 'gh-123', 'sso@e.com');

    const agent = request.agent(app);
    await loginAs(agent, 'ssouser', 'longpassword');

    const res = await agent.get('/api/users/me/identities');
    expect(res.status).toBe(200);
    expect(res.body.identities.length).toBe(1);
    expect(res.body.identities[0].provider).toBe('github');
    expect(res.body.identities[0].email).toBe('sso@e.com');
  });

  test('C3-4: SSO-only user with one provider cannot unlink (would be locked out)', async () => {
    const userId = createUser('ssosolo', 'solo@e.com', 'longpassword');
    addIdentity(userId, 'google', 'g-solo', 'solo@e.com');

    // 1. Log in normally to get a valid signed session cookie
    const agent = request.agent(app);
    const token = await loginAs(agent, 'ssosolo', 'longpassword');

    // 2. Force the user to be "SSO-only" by removing their password in the DB
    const db = require('../src/database/db');
    db.prepare("UPDATE users SET password = '!unusable' WHERE id = ?").run(userId);

    // 3. Try to unlink their ONLY identity (the agent still has a valid session)
    const res = await agent.delete('/api/users/me/identities/google').set('x-csrf-token', token);

    // 4. The server MUST reject this (409 Conflict) to prevent lockout
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/only authentication method/i);

    // 5. Verify the identity still exists in the DB
    const identCount = db.prepare('SELECT COUNT(*) AS c FROM identities WHERE user_id = ?').get(userId).c;
    expect(identCount).toBe(1);
  });

  test('C3-5: DELETE with invalid provider returns 400', async () => {
    const userId = createUser('invalidprov', 'ip@e.com', 'longpassword');
    addIdentity(userId, 'github', 'gh-ip', 'ip@e.com');

    const agent = request.agent(app);
    const token = await loginAs(agent, 'invalidprov', 'longpassword');

    const res = await agent.delete('/api/users/me/identities/twitter').set('x-csrf-token', token);
    expect(res.status).toBe(400);
  });

  test('C3-6: DELETE with unlinked provider returns 404', async () => {
    createUser('nolink', 'nl@e.com', 'longpassword');

    const agent = request.agent(app);
    const token = await loginAs(agent, 'nolink', 'longpassword');

    const res = await agent.delete('/api/users/me/identities/github').set('x-csrf-token', token);
    expect(res.status).toBe(404);
  });

  test('C3-7: user with password can unlink provider', async () => {
    const userId = createUser('unlinkme', 'ul@e.com', 'longpassword');
    addIdentity(userId, 'github', 'gh-ul', 'ul@e.com');

    const agent = request.agent(app);
    const token = await loginAs(agent, 'unlinkme', 'longpassword');

    const res = await agent.delete('/api/users/me/identities/github').set('x-csrf-token', token);
    expect(res.status).toBe(200);
    expect(res.body.unlinked).toBe('github');

    // Verify DB
    const db = require('../src/database/db');
    const count = db
      .prepare('SELECT COUNT(*) AS c FROM identities WHERE user_id = ?')
      .get(userId).c;
    expect(count).toBe(0);
  });

  test('C3-8: unlink revokes OTHER sessions and creates a new one', async () => {
    const userId = createUser('revokecheck', 'rc@e.com', 'longpassword');
    addIdentity(userId, 'github', 'gh-rc', 'rc@e.com');

    // Login from device 1
    const device1 = request.agent(app);
    const token1 = await loginAs(device1, 'revokecheck', 'longpassword');

    // Manually add another "old" session for this user
    const db = require('../src/database/db');
    const sessionModel = require('../src/models/session.model');
    const config = require('../src/config');
    const oldSession = sessionModel.create(userId, config.session.maxAgeMs, null);

    const countBefore = db
      .prepare('SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?')
      .get(userId).c;
    expect(countBefore).toBeGreaterThanOrEqual(2);

    // Unlink from device 1
    const res = await device1.delete('/api/users/me/identities/github').set('x-csrf-token', token1);
    expect(res.status).toBe(200);

    // Only the new session remains (device 1 got a fresh one)
    const countAfter = db
      .prepare('SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?')
      .get(userId).c;
    expect(countAfter).toBe(1);

    // The old manual session is gone
    const stillThere = db.prepare('SELECT id FROM sessions WHERE id = ?').get(oldSession.id);
    expect(stillThere).toBeUndefined();
  });

  test('C3-9: user with two SSO providers can unlink one (safety bypass)', async () => {
    const userId = createUser('dualprovider', 'dp@e.com', 'longpassword');
    addIdentity(userId, 'google', 'g-dp', 'dp@e.com');
    addIdentity(userId, 'github', 'gh-dp', 'dp@e.com');

    // 1. Log in normally to get a valid session
    const agent = request.agent(app);
    const token = await loginAs(agent, 'dualprovider', 'longpassword');

    // 2. Force the user to be "SSO-only"
    const db = require('../src/database/db');
    db.prepare("UPDATE users SET password = '!unusable' WHERE id = ?").run(userId);

    // 3. Try to unlink ONE identity
    const res = await agent.delete('/api/users/me/identities/google').set('x-csrf-token', token);

    // 4. The server should ALLOW it because they still have the github identity
    expect(res.status).toBe(200);
    expect(res.body.unlinked).toBe('google');

    // 5. Verify only 1 identity remains
    const identCount = db.prepare('SELECT COUNT(*) AS c FROM identities WHERE user_id = ?').get(userId).c;
    expect(identCount).toBe(1);
  });
});
