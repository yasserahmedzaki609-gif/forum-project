require('./setup');

jest.mock('../src/auth/providers/google.provider', () => ({
  buildAuthUrl: jest.fn(async ({ state }) => `https://accounts.google.com/x?state=${state}`),
  exchangeCode: jest.fn(async () => ({
    provider: 'google',
    providerUserId: 'goog-A',
    email: 'shared@example.com',
    emailVerified: true,
    displayName: 'Google User',
    avatarUrl: null,
  })),
}));

jest.mock('../src/auth/providers/github.provider', () => ({
  buildAuthUrl: jest.fn(({ state }) => `https://github.com/login/oauth/authorize?state=${state}`),
  exchangeCode: jest.fn(async () => ({
    provider: 'github',
    providerUserId: 'gh-A',
    email: 'shared@example.com',
    emailVerified: true,
    displayName: 'GitHub User',
    avatarUrl: null,
  })),
}));

process.env.GOOGLE_CLIENT_ID = 'g-id';
process.env.GOOGLE_CLIENT_SECRET = 'g-secret';
process.env.GITHUB_CLIENT_ID = 'h-id';
process.env.GITHUB_CLIENT_SECRET = 'h-secret';

const { resetDb, getCsrfFor, request } = require('./helpers');

let app;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
});

describe('SSO — Account Linking', () => {
  test('verified email links to existing local account', async () => {
    const agent = request.agent(app);
    const { token: csrf } = await getCsrfFor(agent);

    const reg = await agent
      .post('/register')
      .set('x-csrf-token', csrf)
      .send({ username: 'shareduser', email: 'shared@example.com', password: 'longpassword' });
    expect(reg.status).toBe(201);

    const db = require('../src/database/db');
    const before = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;

    const s = await agent.get('/auth/google');
    const state = new URL(s.headers.location).searchParams.get('state');
    const cb = await agent.get(`/auth/google/callback?code=ok&state=${state}`);
    expect(cb.status).toBe(302);

    const after = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    expect(after).toBe(before);

    const identity = db.prepare("SELECT * FROM identities WHERE provider='google'").get();
    expect(identity).toBeTruthy();
    expect(identity.email).toBe('shared@example.com');
  });

  test('user can accumulate multiple providers', async () => {
    const db = require('../src/database/db');

    const agent = request.agent(app);
    const s = await agent.get('/auth/github');
    const st = new URL(s.headers.location).searchParams.get('state');
    const cb = await agent.get(`/auth/github/callback?code=ok&state=${st}`);
    expect(cb.status).toBe(302);

    const userId = db
      .prepare("SELECT user_id FROM identities WHERE provider='google'")
      .get().user_id;
    const linked = db
      .prepare('SELECT provider FROM identities WHERE user_id = ? ORDER BY provider')
      .all(userId)
      .map((r) => r.provider);

    expect(linked).toEqual(['github', 'google']);
  });
});

describe('SSO — Unverified Email Protection', () => {
  test('unverified email does not link to existing user', async () => {
    const googleProvider = require('../src/auth/providers/google.provider');
    googleProvider.exchangeCode.mockImplementationOnce(async () => ({
      provider: 'google',
      providerUserId: 'goog-attacker',
      email: 'shared@example.com',
      emailVerified: false,
      displayName: 'Attacker',
      avatarUrl: null,
    }));

    const db = require('../src/database/db');
    const before = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;

    const agent = request.agent(app);
    const s = await agent.get('/auth/google');
    const state = new URL(s.headers.location).searchParams.get('state');
    const cb = await agent.get(`/auth/google/callback?code=ok&state=${state}`);

    expect(cb.status).toBe(409);

    const after = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    expect(after).toBe(before);

    const attackerIdentity = db
      .prepare("SELECT * FROM identities WHERE provider_user_id = 'goog-attacker'")
      .get();
    expect(attackerIdentity).toBeUndefined();
  });
});

// ============================================================================
// SSO — First-User Admin Bootstrap (B1)
// ----------------------------------------------------------------------------
// Regression tests for the bootstrapping hole: if the very first user ever
// to touch the system signs up via SSO, they must become admin, not a
// regular user. Otherwise the deployment has no admin and no way to
// promote anyone.
// ============================================================================
describe('SSO — First-User Admin Bootstrap (B1)', () => {
  let freshApp;

  beforeAll(async () => {
    await resetDb();
    freshApp = require('../src/app');
  });

  test('B1: first-ever user via SSO becomes admin', async () => {
    const db = require('../src/database/db');
    expect(db.prepare('SELECT COUNT(*) AS c FROM users').get().c).toBe(0);

    const googleProvider = require('../src/auth/providers/google.provider');
    googleProvider.exchangeCode.mockImplementationOnce(async () => ({
      provider: 'google',
      providerUserId: 'bootstrap-g-1',
      email: 'bootstrap@example.com',
      emailVerified: true,
      displayName: 'Bootstrap User',
      avatarUrl: null,
    }));

    const agent = request.agent(freshApp);
    const start = await agent.get('/auth/google');
    const state = new URL(start.headers.location).searchParams.get('state');
    const cb = await agent.get(`/auth/google/callback?code=ok&state=${state}`);
    expect(cb.status).toBe(302);

    const user = db
      .prepare('SELECT id, role FROM users WHERE email = ?')
      .get('bootstrap@example.com');
    expect(user).toBeDefined();
    expect(user.role).toBe('admin');
  });

  test('B1: second user via SSO becomes regular user', async () => {
    const db = require('../src/database/db');
    const googleProvider = require('../src/auth/providers/google.provider');
    googleProvider.exchangeCode.mockImplementationOnce(async () => ({
      provider: 'google',
      providerUserId: 'bootstrap-g-2',
      email: 'second@example.com',
      emailVerified: true,
      displayName: 'Second User',
      avatarUrl: null,
    }));

    const agent = request.agent(freshApp);
    const start = await agent.get('/auth/google');
    const state = new URL(start.headers.location).searchParams.get('state');
    await agent.get(`/auth/google/callback?code=ok&state=${state}`);

    const user = db.prepare('SELECT role FROM users WHERE email = ?').get('second@example.com');
    expect(user.role).toBe('user');
  });

  test('B1: local register still makes first user admin (regression)', async () => {
    await resetDb();
    const localApp = require('../src/app');

    const db = require('../src/database/db');
    expect(db.prepare('SELECT COUNT(*) AS c FROM users').get().c).toBe(0);

    const agent = request.agent(localApp);
    const { token } = await getCsrfFor(agent);
    const res = await agent.post('/register').set('x-csrf-token', token).send({
      username: 'firstlocal',
      email: 'firstlocal@e.com',
      password: 'longpassword',
    });
    expect(res.status).toBe(201);

    const user = db.prepare('SELECT role FROM users WHERE username = ?').get('firstlocal');
    expect(user.role).toBe('admin');
  });
});
