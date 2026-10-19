require('./setup');
const sharp = require('sharp');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app, agent, csrf, postId, mediaId;

async function makePng() {
  return sharp({
    create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 0, b: 255 } },
  }).png().toBuffer();
}

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
  agent = request.agent(app);
  const { token } = await getCsrfFor(agent);
  csrf = token;

  await agent.post('/register').set('x-csrf-token', csrf)
    .send({ username: 'lcuser', email: 'lc@e.com', password: 'longpassword' });
  await agent.post('/login').set('x-csrf-token', csrf)
    .send({ username: 'lcuser', password: 'longpassword' });

  const p = await agent.post('/api/posts').set('x-csrf-token', csrf)
    .send({ title: 'Lifecycle test post', content: 'Body content', categoryIds: [1] });
  postId = p.body.id;

  const up = await agent.post(`/api/posts/${postId}/media`)
    .set('x-csrf-token', csrf)
    .attach('file', await makePng(), 'x.png');
  mediaId = up.body.id;
});

describe('Media lifecycle', () => {
  test('owner can delete own media', async () => {
    const res = await agent.delete(`/api/media/${mediaId}`).set('x-csrf-token', csrf);
    expect(res.status).toBe(200);
    const after = await request(app).get(`/api/media/${mediaId}`);
    expect(after.status).toBe(404);
  });

  test('non-owner cannot delete', async () => {
    const up = await agent.post(`/api/posts/${postId}/media`)
      .set('x-csrf-token', csrf)
      .attach('file', await makePng(), 'y.png');
    const id = up.body.id;

    const other = request.agent(app);
    const { token: t2 } = await getCsrfFor(other);
    await other.post('/register').set('x-csrf-token', t2)
      .send({ username: 'other', email: 'o@e.com', password: 'longpassword' });
    await other.post('/login').set('x-csrf-token', t2)
      .send({ username: 'other', password: 'longpassword' });

    const res = await other.delete(`/api/media/${id}`).set('x-csrf-token', t2);
    expect(res.status).toBe(403);
  });

  test('list media for post returns uploaded items', async () => {
    const res = await request(app).get(`/api/posts/${postId}/media`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});