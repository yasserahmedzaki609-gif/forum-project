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
    .send({ username: 'secuser', email: 'sec@e.com', password: 'longpassword' });
  await agent.post('/login').set('x-csrf-token', csrf)
    .send({ username: 'secuser', password: 'longpassword' });

  const p = await agent.post('/api/posts').set('x-csrf-token', csrf)
    .send({ title: 'Security test post', content: 'Body content', categoryIds: [1] });
  postId = p.body.id;
});

describe('Media security', () => {
  test('rejects non-image file (exe renamed)', async () => {
    const buf = Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'binary');
    const res = await agent.post(`/api/posts/${postId}/media`)
      .set('x-csrf-token', csrf)
      .attach('file', buf, 'not_really.jpg');
    expect(res.status).toBe(415);
  });

  test('rejects SVG (XSS vector)', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'
    );
    const res = await agent.post(`/api/posts/${postId}/media`)
      .set('x-csrf-token', csrf)
      .attach('file', svg, 'x.svg');
    expect(res.status).toBe(415);
  });

  test('rejects text file with image extension', async () => {
    const buf = Buffer.from('hello world', 'utf8');
    const res = await agent.post(`/api/posts/${postId}/media`)
      .set('x-csrf-token', csrf)
      .attach('file', buf, 'fake.png');
    expect([400, 415]).toContain(res.status);
  });

  test('rejects empty file', async () => {
    const res = await agent.post(`/api/posts/${postId}/media`)
      .set('x-csrf-token', csrf)
      .attach('file', Buffer.alloc(0), 'empty.png');
    expect([400, 415]).toContain(res.status);
  });
});