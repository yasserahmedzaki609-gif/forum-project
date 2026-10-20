require('./setup');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app, agent, csrf;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
  agent = request.agent(app);
  const { token } = await getCsrfFor(agent);
  csrf = token;

  await agent.post('/register').set('x-csrf-token', csrf)
    .send({ username: 'suser', email: 's@example.com', password: 'longpassword' });
  await agent.post('/login').set('x-csrf-token', csrf)
    .send({ username: 'suser', password: 'longpassword' });
});

describe('Security', () => {
  test('session cookie is HttpOnly and SameSite=Lax', async () => {
    // Fresh agent so the CSRF cookie and header match.
    const freshAgent = request.agent(app);
    const { token } = await getCsrfFor(freshAgent);

    await freshAgent
      .post('/register')
      .set('x-csrf-token', token)
      .send({
        username: 'cookieuser',
        email: 'cookieuser@e.com',
        password: 'longpassword',
      });

    const res = await freshAgent
      .post('/login')
      .set('x-csrf-token', token)
      .send({ username: 'cookieuser', password: 'longpassword' });

    const cookies = res.headers['set-cookie'] || [];
    const sess = cookies.find((c) => c.startsWith('forum_session='));
    expect(sess).toBeDefined();
    expect(sess).toMatch(/HttpOnly/i);
    expect(sess).toMatch(/SameSite=Lax/i);
  });

  test('body limit rejects oversized payload', async () => {
    const big = 'x'.repeat(50000); // > 10kb
    const res = await agent
      .post('/api/posts')
      .set('x-csrf-token', csrf)
      .send({ title: 'A', content: big, categoryIds: [1] });
    expect([400, 413]).toContain(res.status);
  });

  test('unknown route returns JSON 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });

  test('SQL injection in category is not exploitable', async () => {
    const res = await request(app).get(
      "/api/posts?category=' OR 1=1 --"
    );
    expect(res.status).toBe(404); // Or 400 depending on your validation layer
  });

  test('security headers are set', async () => {
    const res = await request(app).get('/auth/providers');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  test('error responses do not leak stack in production', async () => {
    const res = await request(app).get('/api/posts?filter=my_posts');
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.stack).toBeUndefined(); // Strategic addition: ensure stack is hidden
  });

  // ------------------------------------------------------------------------
  // H1: Infrastructure Health Contract Validation
  // ------------------------------------------------------------------------
  test('H1: /health returns 200 with db=ok', async () => {
    const res = await request(app).get('/health');
    
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.version).toBeDefined();
  });
});