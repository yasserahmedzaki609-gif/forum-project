require('./setup');
const { resetDb, getCsrfFor, request } = require('./helpers');

let app;

beforeAll(async () => {
  await resetDb();
  app = require('../src/app');
});

describe('F06 — Advanced Features', () => {
  let userA, tokenA, userB, tokenB, postId;

  beforeAll(async () => {
    // User A
    userA = request.agent(app);
    const { token: ta } = await getCsrfFor(userA);
    tokenA = ta;
    await userA.post('/register').set('x-csrf-token', tokenA)
      .send({ username: 'usera', email: 'a@e.com', password: 'longpassword' });
    await userA.post('/login').set('x-csrf-token', tokenA)
      .send({ username: 'usera', password: 'longpassword' });

    // User B
    userB = request.agent(app);
    const { token: tb } = await getCsrfFor(userB);
    tokenB = tb;
    await userB.post('/register').set('x-csrf-token', tokenB)
      .send({ username: 'userb', email: 'b@e.com', password: 'longpassword' });
    await userB.post('/login').set('x-csrf-token', tokenB)
      .send({ username: 'userb', password: 'longpassword' });
  });

  test('create post logs activity', async () => {
    const res = await userA.post('/api/posts').set('x-csrf-token', tokenA)
      .send({ title: 'First Post', content: 'Hello', categoryIds: [1] });
    expect(res.status).toBe(201);
    postId = res.body.id;

    const act = await userA.get('/api/activity/me');
    expect(act.status).toBe(200);
    expect(act.body.some(a => a.action === 'post_create' && a.target_id === postId)).toBe(true);
  });

  test('edit post updates content and logs activity', async () => {
    const post = await userA.get('/api/posts?page=1&pageSize=100');
    const p = post.body.data.find(x => x.id === postId);

    const res = await userA.put(`/api/posts/${postId}`).set('x-csrf-token', tokenA)
      .send({
        title: 'First Post (edited)',
        content: 'Updated',
        categoryIds: [1],
        updatedAt: p.updated_at,
      });
    expect(res.status).toBe(200);

    const act = await userA.get('/api/activity/me');
    expect(act.body.some(a => a.action === 'post_edit' && a.target_id === postId)).toBe(true);
  });

  test('stale update rejected (409)', async () => {
    const post = await userA.get('/api/posts?page=1&pageSize=100');
    const p = post.body.data.find(x => x.id === postId);

    // First edit succeeds
    await userA.put(`/api/posts/${postId}`).set('x-csrf-token', tokenA)
      .send({
        title: 'Edit 1',
        content: 'V1',
        categoryIds: [1],
        updatedAt: p.updated_at,
      });

    // Second edit with OLD updatedAt → 409
    const res = await userA.put(`/api/posts/${postId}`).set('x-csrf-token', tokenA)
      .send({
        title: 'Edit 2',
        content: 'V2',
        categoryIds: [1],
        updatedAt: p.updated_at, // stale
      });
    expect(res.status).toBe(409);
  });

  test('other user cannot edit someone else\'s post', async () => {
    const post = await userB.get('/api/posts?page=1&pageSize=100');
    const p = post.body.data.find(x => x.id === postId);

    const res = await userB.put(`/api/posts/${postId}`).set('x-csrf-token', tokenB)
      .send({
        title: 'Hijacked',
        content: 'Nope',
        categoryIds: [1],
        updatedAt: p.updated_at,
      });
    expect(res.status).toBe(403);
  });

  test('comment triggers notification to post owner', async () => {
    // User B comments on User A's post
    await userB.post(`/api/posts/${postId}/comments`).set('x-csrf-token', tokenB)
      .send({ content: 'Nice post!' });

    // User A should have 1 unread notification
    const notif = await userA.get('/api/notifications');
    expect(notif.status).toBe(200);
    expect(notif.body.length).toBeGreaterThan(0);
    expect(notif.body[0].type).toBe('comment');
    expect(notif.body[0].is_read).toBe(0);

    // Mark as read
    const mark = await userA.patch(`/api/notifications/${notif.body[0].id}/read`)
      .set('x-csrf-token', tokenA);
    expect(mark.status).toBe(200);
  });

  test('like triggers notification but self-like does not', async () => {
    // User B likes A's post
    await userB.post(`/api/posts/${postId}/like`).set('x-csrf-token', tokenB);
    const notif = await userA.get('/api/notifications');
    expect(notif.body.some(n => n.type === 'like')).toBe(true);

    // User A likes own post → no notification
    await userA.post(`/api/posts/${postId}/like`).set('x-csrf-token', tokenA);
    const notif2 = await userA.get('/api/notifications');
    const selfLikes = notif2.body.filter(n => n.type === 'like' && n.actor_name === 'usera');
    expect(selfLikes.length).toBe(0);
  });

  test('only owner can delete post', async () => {
    const res = await userB.delete(`/api/posts/${postId}`).set('x-csrf-token', tokenB);
    expect(res.status).toBe(403);
  });

  test('owner can delete own post', async () => {
    const res = await userA.delete(`/api/posts/${postId}`).set('x-csrf-token', tokenA);
    expect(res.status).toBe(200);

    const get = await request(app).get(`/api/posts/${postId}`);
    // 404 because it's deleted (postModel.findById returns undefined, list won't include it)
    const list = await request(app).get('/api/posts');
    expect(list.body.data.some(p => p.id === postId)).toBe(false);
  });
});