require('./setup');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app, agent, csrf, postId;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
  agent = request.agent(app);
  const { token } = await getCsrfFor(agent);
  csrf = token;

  await agent.post('/register').set('x-csrf-token', csrf)
    .send({ username: 'spostuser', email: 'spost@e.com', password: 'longpassword' });
  await agent.post('/login').set('x-csrf-token', csrf)
    .send({ username: 'spostuser', password: 'longpassword' });

  const p = await agent.post('/api/posts').set('x-csrf-token', csrf)
    .send({ title: 'Single post test', content: 'Body', categoryIds: [1] });
  postId = p.body.id;
});

describe('GET /api/posts/:postId', () => {
  test('returns post with categories array', async () => {
    const res = await request(app).get(`/api/posts/${postId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(postId);
    expect(Array.isArray(res.body.categories)).toBe(true);
    expect(res.body.categories.length).toBeGreaterThan(0);
    expect(res.body.updated_at).toBeTruthy();
    expect(res.body.author).toBe('spostuser');
  });

  test('returns 404 for unknown post', async () => {
    const res = await request(app).get('/api/posts/99999');
    expect(res.status).toBe(404);
  });

  test('returns 400 for invalid id', async () => {
    const res = await request(app).get('/api/posts/abc');
    expect(res.status).toBe(400);
  });
});