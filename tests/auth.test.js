require('./setup');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app;
let agent;
let csrf;

beforeAll(async () => {
  await resetDb(); // هذا يستدعي migrations و seed تلقائياً
  app = require('../src/app');
  agent = request.agent(app);
  const { token } = await getCsrfFor(agent);
  csrf = token;
});

describe('Auth', () => {
  test('register rejects missing fields', async () => {
    const res = await agent
      .post('/register')
      .set('x-csrf-token', csrf)
      .send({});
    expect(res.status).toBe(400);
  });

  test('register rejects invalid email', async () => {
    const res = await agent
      .post('/register')
      .set('x-csrf-token', csrf)
      .send({ username: 'u1', email: 'not-an-email', password: 'longpassword' });
    expect(res.status).toBe(400);
  });

  test('register rejects short password', async () => {
    const res = await agent
      .post('/register')
      .set('x-csrf-token', csrf)
      .send({ username: 'u2', email: 'u2@example.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  test('register succeeds', async () => {
    const res = await agent
      .post('/register')
      .set('x-csrf-token', csrf)
      .send({ username: 'alice', email: 'alice@example.com', password: 'longpassword' });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe('alice');
  });

  test('register rejects duplicate email', async () => {
    const res = await agent
      .post('/register')
      .set('x-csrf-token', csrf)
      .send({ username: 'alice2', email: 'alice@example.com', password: 'longpassword' });
    expect(res.status).toBe(409);
  });

  test('login fails with wrong password', async () => {
    const res = await agent
      .post('/login')
      .set('x-csrf-token', csrf)
      .send({ username: 'alice', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  test('login succeeds and sets session cookie', async () => {
    const res = await agent
      .post('/login')
      .set('x-csrf-token', csrf)
      .send({ username: 'alice', password: 'longpassword' });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] || [];
    expect(cookies.some((c) => c.startsWith('forum_session='))).toBe(true);
  });

  test('GET /me unauthenticated', async () => {
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
    expect(res.body.loggedIn).toBe(false);
  });

  test('GET /me authenticated', async () => {
    const res = await agent.get('/me');
    expect(res.status).toBe(200);
    expect(res.body.loggedIn).toBe(true);
    expect(res.body.username).toBe('alice');
  });

  test('passwords are hashed in DB', async () => {
    const db = require('../src/database/db');
    const row = db.prepare('SELECT password FROM users WHERE username = ?').get('alice');
    expect(row.password).not.toBe('longpassword');
    expect(row.password.startsWith('$2')).toBe(true); // bcrypt prefix
  });

  test('logout clears session', async () => {
    const res = await agent
      .post('/logout')
      .set('x-csrf-token', csrf);
    expect(res.status).toBe(200);

    const me = await agent.get('/me');
    expect(me.status).toBe(401);
  });
});