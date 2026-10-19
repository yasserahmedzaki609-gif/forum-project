require('./setup');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
});

describe('F04 — Rate Limiting', () => {
  test('login blocked after 10 attempts for same username', async () => {
    const regAgent = request.agent(app);
    const { token: regToken } = await getCsrfFor(regAgent);
    await regAgent.post('/register')
      .set('x-csrf-token', regToken)
      .send({ username: 'limituser', email: 'limit@e.com', password: 'longpassword' });

    for (let i = 0; i < 10; i++) {
      const agent = request.agent(app);
      const { token } = await getCsrfFor(agent);
      const res = await agent.post('/login')
        .set('x-csrf-token', token)
        .send({ username: 'limituser', password: 'wrongpassword' });
      expect(res.status).toBe(401);
    }

    const agent = request.agent(app);
    const { token } = await getCsrfFor(agent);
    const blocked = await agent.post('/login')
      .set('x-csrf-token', token)
      .send({ username: 'limituser', password: 'longpassword' });
    expect(blocked.status).toBe(429);
  });

  test('different usernames have independent login limits', async () => {
    const regAgent = request.agent(app);
    const { token: regToken } = await getCsrfFor(regAgent);
    await regAgent.post('/register')
      .set('x-csrf-token', regToken)
      .send({ username: 'otheruser', email: 'other@e.com', password: 'longpassword' });

    const agent = request.agent(app);
    const { token } = await getCsrfFor(agent);
    const res = await agent.post('/login')
      .set('x-csrf-token', token)
      .send({ username: 'otheruser', password: 'longpassword' });
    expect(res.status).toBe(200);
  });

  test('post creation blocked after 10 posts within window', async () => {
    const agent = request.agent(app);
    const { token } = await getCsrfFor(agent);

    await agent.post('/register')
      .set('x-csrf-token', token)
      .send({ username: 'spammer', email: 'spam@e.com', password: 'longpassword' });
    await agent.post('/login')
      .set('x-csrf-token', token)
      .send({ username: 'spammer', password: 'longpassword' });

    for (let i = 1; i <= 10; i++) {
      const res = await agent.post('/api/posts')
        .set('x-csrf-token', token)
        .send({ title: `Post ${i}`, content: `Content ${i}`, categoryIds: [1] });
      expect(res.status).toBe(201);
    }

    const blocked = await agent.post('/api/posts')
      .set('x-csrf-token', token)
      .send({ title: 'Post 11', content: 'Blocked', categoryIds: [1] });
    expect(blocked.status).toBe(429);
  });

  test('comment creation blocked after 20 comments', async () => {
    const agent = request.agent(app);
    const { token } = await getCsrfFor(agent);

    await agent.post('/register')
      .set('x-csrf-token', token)
      .send({ username: 'chatty', email: 'chatty@e.com', password: 'longpassword' });
    await agent.post('/login')
      .set('x-csrf-token', token)
      .send({ username: 'chatty', password: 'longpassword' });

    const post = await agent.post('/api/posts')
      .set('x-csrf-token', token)
      .send({ title: 'Target post', content: 'Body', categoryIds: [1] });
    const postId = post.body.id;

    for (let i = 1; i <= 20; i++) {
      const res = await agent.post(`/api/posts/${postId}/comments`)
        .set('x-csrf-token', token)
        .send({ content: `Comment ${i}` });
      expect(res.status).toBe(201);
    }

    const blocked = await agent.post(`/api/posts/${postId}/comments`)
      .set('x-csrf-token', token)
      .send({ content: 'Blocked' });
    expect(blocked.status).toBe(429);
  });
});