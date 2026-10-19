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
    .send({ username: 'cuser', email: 'c@example.com', password: 'longpassword' });
  await agent.post('/login').set('x-csrf-token', csrf)
    .send({ username: 'cuser', password: 'longpassword' });

  const p = await agent.post('/api/posts').set('x-csrf-token', csrf)
    .send({ title: 'Post', content: 'Body', categoryIds: [1] });
  postId = p.body.id;
});

describe('Comments', () => {
  test('list comments is public', async () => {
    const res = await request(app).get(`/api/posts/${postId}/comments`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('add comment requires CSRF (403)', async () => {
    const res = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .send({ content: 'hi' });
    expect(res.status).toBe(403);
  });

  test('add comment requires auth after CSRF', async () => {
    const anonAgent = request.agent(app);
    const { token } = await getCsrfFor(anonAgent);
    const res = await anonAgent
      .post(`/api/posts/${postId}/comments`)
      .set('x-csrf-token', token)
      .send({ content: 'hi' });
    expect(res.status).toBe(401);
  });

  test('add comment succeeds', async () => {
    const res = await agent
      .post(`/api/posts/${postId}/comments`)
      .set('x-csrf-token', csrf)
      .send({ content: 'Nice post!' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeGreaterThan(0);
  });

  test('comment appears in list', async () => {
    const res = await request(app).get(`/api/posts/${postId}/comments`);
    expect(res.body.length).toBe(1);
    expect(res.body[0].content).toBe('Nice post!');
    expect(res.body[0].author).toBe('cuser');
  });

  test('rejects empty comment', async () => {
    const res = await agent
      .post(`/api/posts/${postId}/comments`)
      .set('x-csrf-token', csrf)
      .send({ content: '   ' });
    expect(res.status).toBe(400);
  });

  test('rejects comment on unknown post', async () => {
    const res = await agent
      .post('/api/posts/99999/comments')
      .set('x-csrf-token', csrf)
      .send({ content: 'hi' });
    expect(res.status).toBe(404);
  });
});