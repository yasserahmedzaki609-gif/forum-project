require('./setup');

jest.mock('../src/auth/providers/github.provider', () => ({
  buildAuthUrl: jest.fn(({ state, codeChallenge }) => {
    const u = new URL('https://github.com/login/oauth/authorize');
    u.searchParams.set('state', state);
    u.searchParams.set('code_challenge', codeChallenge);
    u.searchParams.set('code_challenge_method', 'S256');
    return u.toString();
  }),
  exchangeCode: jest.fn(async () => ({
    provider: 'github',
    providerUserId: 'gh-uid-42',
    email: 'bob.github@example.com',
    emailVerified: true,
    displayName: 'Bob GitHub',
    avatarUrl: 'https://avatars.githubusercontent.com/u/42',
  })),
}));

process.env.GITHUB_CLIENT_ID = 'test-gh-id';
process.env.GITHUB_CLIENT_SECRET = 'test-gh-secret';
process.env.GITHUB_REDIRECT_URI = 'https://localhost:3000/auth/github/callback';

const { resetDb, request } = require('./helpers');

let app;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
});

describe('SSO — GitHub', () => {
  test('status shows github enabled', async () => {
    const res = await request(app).get('/auth/providers');
    expect(res.status).toBe(200);
    expect(res.body.providers.github).toBe(true);
  });

  test('start redirects to GitHub with PKCE', async () => {
    const res = await request(app).get('/auth/github');
    expect(res.status).toBe(302);
    const u = new URL(res.headers.location);
    expect(u.origin + u.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('state')).toBeTruthy();
  });

  test('callback rejects bad state', async () => {
    const res = await request(app).get('/auth/github/callback?code=x&state=nope');
    expect(res.status).toBe(400);
  });

  test('full flow creates user + session', async () => {
    const agent = request.agent(app);
    const s = await agent.get('/auth/github');
    const state = new URL(s.headers.location).searchParams.get('state');

    const cb = await agent.get(`/auth/github/callback?code=ok&state=${state}`);
    expect(cb.status).toBe(302);

    const me = await agent.get('/me');
    expect(me.status).toBe(200);
    expect(me.body.loggedIn).toBe(true);

    const db = require('../src/database/db');
    const row = db.prepare("SELECT * FROM identities WHERE provider='github'").get();
    expect(row.provider_user_id).toBe('gh-uid-42');
  });

  test('unknown provider returns 404', async () => {
    const res = await request(app).get('/auth/twitter');
    expect(res.status).toBe(404);
  });
});
