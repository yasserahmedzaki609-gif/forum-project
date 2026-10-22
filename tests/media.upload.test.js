require('./setup');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app, agent, csrf, postId;

async function makePng() {
  return sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
  agent = request.agent(app);
  const { token } = await getCsrfFor(agent);
  csrf = token;

  await agent
    .post('/register')
    .set('x-csrf-token', csrf)
    .send({ username: 'muser', email: 'm@e.com', password: 'longpassword' });
  await agent
    .post('/login')
    .set('x-csrf-token', csrf)
    .send({ username: 'muser', password: 'longpassword' });

  const p = await agent
    .post('/api/posts')
    .set('x-csrf-token', csrf)
    .send({ title: 'Post with media', content: 'Body content', categoryIds: [1] });
  postId = p.body.id;

  const root = path.resolve('./media/test');
  if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Media upload', () => {
  test('rejects upload without auth (401 after CSRF)', async () => {
    const anon = request.agent(app);
    const { token } = await getCsrfFor(anon);
    const buf = await makePng();
    const res = await anon
      .post(`/api/posts/${postId}/media`)
      .set('x-csrf-token', token)
      .attach('file', buf, 'a.png');
    expect(res.status).toBe(401);
  });

  test('rejects upload without CSRF (403)', async () => {
    const buf = await makePng();
    const res = await agent.post(`/api/posts/${postId}/media`).attach('file', buf, 'a.png');
    expect(res.status).toBe(403);
  });

  test('accepts valid PNG and returns URL', async () => {
    const buf = await makePng();
    const res = await agent
      .post(`/api/posts/${postId}/media`)
      .set('x-csrf-token', csrf)
      .attach('file', buf, 'a.png');
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/api\/media\/\d+$/);
    expect(res.body.width).toBeGreaterThan(0);
    expect(res.body.height).toBeGreaterThan(0);
  });

  test('rejects file over size limit (413)', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 0xff);
    const res = await agent
      .post(`/api/posts/${postId}/media`)
      .set('x-csrf-token', csrf)
      .attach('file', big, 'huge.png');
    expect([400, 413]).toContain(res.status);
  });

  test('serves uploaded media with correct headers', async () => {
    const buf = await makePng();
    const up = await agent
      .post(`/api/posts/${postId}/media`)
      .set('x-csrf-token', csrf)
      .attach('file', buf, 'serve.png');
    const res = await request(app).get(up.body.url);
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-type']).toMatch(/^image\//);
  });
});
