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
    .send({ username: 'puser', email: 'p@example.com', password: 'longpassword' });
  await agent.post('/login').set('x-csrf-token', csrf)
    .send({ username: 'puser', password: 'longpassword' });
});

describe('Posts', () => {
  test('list posts is public', async () => {
    const res = await request(app).get('/api/posts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  test('create post requires CSRF (403)', async () => {
    const res = await request(app)
      .post('/api/posts')
      .send({ title: 'Title', content: 'Body', categoryIds: [1] });
    // CSRF middleware runs before requireAuth → 403
    expect(res.status).toBe(403);
  });

  test('create post requires auth after CSRF', async () => {
    const anonAgent = request.agent(app);
    const { token } = await getCsrfFor(anonAgent);
    const res = await anonAgent
      .post('/api/posts')
      .set('x-csrf-token', token)
      .send({ title: 'Title', content: 'Body', categoryIds: [1] });
    expect(res.status).toBe(401);
  });

  test('create post rejects missing categories', async () => {
    const res = await agent
      .post('/api/posts')
      .set('x-csrf-token', csrf)
      .send({ title: 'Hello', content: 'World', categoryIds: [] });
    expect(res.status).toBe(400);
  });

  test('create post with valid data succeeds', async () => {
    const res = await agent
      .post('/api/posts')
      .set('x-csrf-token', csrf)
      .send({ title: 'Hello', content: 'World', categoryIds: [1] });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeGreaterThan(0);
  });

  test('rejects unknown category id', async () => {
    const res = await agent
      .post('/api/posts')
      .set('x-csrf-token', csrf)
      .send({ title: 'X', content: 'Y', categoryIds: [99999] });
    expect(res.status).toBe(400);
  });

  test('rejects too-long content', async () => {
    const res = await agent
      .post('/api/posts')
      .set('x-csrf-token', csrf)
      .send({ title: 'A', content: 'x'.repeat(6000), categoryIds: [1] });
    expect(res.status).toBe(400);
  });

  test('pagination is honored', async () => {
    const res = await request(app).get('/api/posts?page=1&pageSize=1');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.pageSize).toBe(1);
  });

  test('filter my_posts requires auth', async () => {
    const res = await request(app).get('/api/posts?filter=my_posts');
    expect(res.status).toBe(401);
  });

  test('filter my_posts works when authed', async () => {
    const res = await agent.get('/api/posts?filter=my_posts');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('filter my_likes works when authed', async () => {
    const res = await agent.get('/api/posts?filter=my_likes');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0); // no likes yet
  });

  test('unknown category returns 404', async () => {
    const res = await request(app).get('/api/posts?category=NoSuchCategory');
    expect(res.status).toBe(404);
  });
});