require('./setup');

jest.mock('../src/auth/providers/google.provider', () => ({
  buildAuthUrl: jest.fn(async ({ state, nonce, codeChallenge }) => {
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.searchParams.set('state', state);
    u.searchParams.set('nonce', nonce);
    u.searchParams.set('code_challenge', codeChallenge);
    u.searchParams.set('code_challenge_method', 'S256');
    return u.toString();
  }),
  exchangeCode: jest.fn(async () => ({
    provider: 'google',
    providerUserId: 'google-uid-1',
    email: 'alice.google@example.com',
    emailVerified: true,
    displayName: 'Alice Google',
    avatarUrl: 'https://example.com/a.png',
  })),
}));

process.env.GOOGLE_CLIENT_ID = 'test-google-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
process.env.GOOGLE_REDIRECT_URI = 'https://localhost:3000/auth/google/callback';

const { resetDb, request } = require('./helpers');

let app;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
});

describe('SSO — Google', () => {
  test('GET /auth/providers reports google enabled', async () => {
    const res = await request(app).get('/auth/providers');
    expect(res.status).toBe(200);
    expect(res.body.providers.google).toBe(true);
  });

  test('GET /auth/google redirects with PKCE params', async () => {
    const res = await request(app).get('/auth/google');
    expect(res.status).toBe(302);
    const loc = res.headers.location;
    expect(loc).toMatch(/^https:\/\/accounts\.google\.com/);
    const u = new URL(loc);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('state')).toBeTruthy();
    expect(u.searchParams.get('nonce')).toBeTruthy();
    expect(u.searchParams.get('code_challenge')).toBeTruthy();
  });

  test('callback rejects unknown state', async () => {
    const res = await request(app).get('/auth/google/callback?code=x&state=bogus');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/state/i);
  });

  test('full flow: creates user + session', async () => {
    const agent = request.agent(app);

    const start = await agent.get('/auth/google');
    const state = new URL(start.headers.location).searchParams.get('state');

    const cb = await agent.get(`/auth/google/callback?code=ok&state=${state}`);
    expect(cb.status).toBe(302);

    const me = await agent.get('/me');
    expect(me.status).toBe(200);
    expect(me.body.loggedIn).toBe(true);

    const db = require('../src/database/db');
    const ids = db.prepare("SELECT * FROM identities WHERE provider = 'google'").all();
    expect(ids.length).toBe(1);
    expect(ids[0].email).toBe('alice.google@example.com');
  });

  test('state is single-use (replay fails)', async () => {
    const agent = request.agent(app);
    const s = await agent.get('/auth/google');
    const state = new URL(s.headers.location).searchParams.get('state');

    const first = await agent.get(`/auth/google/callback?code=ok&state=${state}`);
    expect(first.status).toBe(302);

    const replay = await agent.get(`/auth/google/callback?code=ok&state=${state}`);
    expect(replay.status).toBe(400);
  });
});
