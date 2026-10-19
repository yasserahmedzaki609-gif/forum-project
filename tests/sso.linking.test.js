require('./setup');

jest.mock('../src/auth/providers/google.provider', () => ({
  buildAuthUrl: jest.fn(async ({ state }) =>
    `https://accounts.google.com/x?state=${state}`),
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
  buildAuthUrl: jest.fn(({ state }) =>
    `https://github.com/login/oauth/authorize?state=${state}`),
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

    const reg = await agent.post('/register').set('x-csrf-token', csrf)
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

    const userId = db.prepare("SELECT user_id FROM identities WHERE provider='google'").get().user_id;
    const linked = db.prepare(
      'SELECT provider FROM identities WHERE user_id = ? ORDER BY provider'
    ).all(userId).map((r) => r.provider);

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

    const attackerIdentity = db.prepare(
      "SELECT * FROM identities WHERE provider_user_id = 'goog-attacker'"
    ).get();
    expect(attackerIdentity).toBeUndefined();
  });
});