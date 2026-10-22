require('./setup');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app, agent, csrf, postId;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
  agent = request.agent(app);
  const { token } = await getCsrfFor(agent);
  csrf = token;

  await agent
    .post('/register')
    .set('x-csrf-token', csrf)
    .send({ username: 'ruser', email: 'r@example.com', password: 'longpassword' });
  await agent
    .post('/login')
    .set('x-csrf-token', csrf)
    .send({ username: 'ruser', password: 'longpassword' });

  // Title must be at least 3 chars (validator requires 3-150).
  const p = await agent
    .post('/api/posts')
    .set('x-csrf-token', csrf)
    .send({ title: 'Reaction test post', content: 'Body content', categoryIds: [1] });
  postId = p.body.id;
});

describe('Reactions', () => {
  test('like without CSRF is 403', async () => {
    const res = await request(app).post(`/api/posts/${postId}/like`);
    expect(res.status).toBe(403);
  });

  test('like without auth (after CSRF) is 401', async () => {
    const anonAgent = request.agent(app);
    const { token } = await getCsrfFor(anonAgent);
    const res = await anonAgent.post(`/api/posts/${postId}/like`).set('x-csrf-token', token);
    expect(res.status).toBe(401);
  });

  test('like adds reaction', async () => {
    const res = await agent.post(`/api/posts/${postId}/like`).set('x-csrf-token', csrf);
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('added');
    expect(res.body.value).toBe(1);
  });

  test('second like removes it (toggle)', async () => {
    const res = await agent.post(`/api/posts/${postId}/like`).set('x-csrf-token', csrf);
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('removed');
  });

  test('dislike after like changes value', async () => {
    await agent.post(`/api/posts/${postId}/like`).set('x-csrf-token', csrf);

    const res = await agent.post(`/api/posts/${postId}/dislike`).set('x-csrf-token', csrf);
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('changed');
    expect(res.body.value).toBe(-1);
  });

  test('unique constraint: one reaction per (user, target)', async () => {
    const db = require('../src/database/db');
    const count = db
      .prepare("SELECT COUNT(*) AS c FROM reactions WHERE target_type='post' AND target_id=?")
      .get(postId).c;
    expect(count).toBe(1);
  });

  test('like on comment works', async () => {
    const c = await agent
      .post(`/api/posts/${postId}/comments`)
      .set('x-csrf-token', csrf)
      .send({ content: 'Nice comment' });
    const commentId = c.body.id;

    const res = await agent.post(`/api/comments/${commentId}/like`).set('x-csrf-token', csrf);
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('added');
  });
});
