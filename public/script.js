/* ============================================================================
 * Forum — Frontend logic (vanilla JS, no frameworks)
 * ==========================================================================*/

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;');
}

function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

async function api(url, options = {}) {
  const opts = { ...options, headers: { ...(options.headers || {}) } };

  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }

  const method = (opts.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    // C6: try both cookie names (prod uses __Host-csrf_token)
    const csrf = getCookie('__Host-csrf_token') || getCookie('csrf_token');
    if (csrf) opts.headers['x-csrf-token'] = csrf;
  }

  const res = await fetch(url, opts);
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('application/json') ? await res.json() : await res.text();
  return { ok: res.ok, status: res.status, body };
}

function setMessage(msg) {
  document.getElementById('message').textContent = msg || '';
}

async function withLoading(button, fn) {
  if (button) button.disabled = true;
  try {
    return await fn();
  } finally {
    if (button) button.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  filter: { type: 'all' },
  page: 1,
  pageSize: 10,
  isLoggedIn: false,
  username: null,
  userId: null,
  role: 'user',
};

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
async function checkSession() {
  const { ok, body } = await api('/me');
  state.isLoggedIn = !!(ok && body.loggedIn);
  state.username = state.isLoggedIn ? body.username : null;
  state.userId = state.isLoggedIn ? body.id : null;
  state.role = state.isLoggedIn ? body.role : 'user';

  const statusBox = document.getElementById('user-status');
  const authForms = document.getElementById('auth-forms');
  const userActions = document.getElementById('user-actions');
  const modSection = document.getElementById('moderation-section');
  const notifBell = document.getElementById('notif-bell');
  const notifDropdown = document.getElementById('notif-dropdown');
  const activitySection = document.getElementById('activity-section');

  if (state.isLoggedIn) {
    statusBox.textContent = `Welcome, ${state.username}! (${state.role})`;
    statusBox.style.background = '#d4edda';
    statusBox.style.color = '#155724';
    authForms.classList.add('hidden');
    userActions.classList.remove('hidden');
    document.querySelectorAll('.user-only').forEach((el) => el.classList.remove('hidden'));

    notifBell.classList.remove('hidden');
    activitySection.classList.remove('hidden');

    // تحميل البيانات المتعلقة بالمستخدم بالتسلسل
    loadNotifications();
    loadActivity();
    loadConnectedAccounts(); // ← C3: تحميل الحسابات المرتبطة فوراً

    if (state.role === 'admin' || state.role === 'moderator') {
      modSection.classList.remove('hidden');
      loadModerationDashboard();
    } else {
      modSection.classList.add('hidden');
    }

    // D2: Categories management is admin-only (moderator cannot manage)
    const adminCatsSection = document.getElementById('admin-categories-section');
    if (state.role === 'admin') {
      adminCatsSection?.classList.remove('hidden');
      loadAdminCategories();
    } else {
      adminCatsSection?.classList.add('hidden');
    }

    // D3: User management is admin-only
    const adminUsersSection = document.getElementById('admin-users-section');
    if (state.role === 'admin') {
      adminUsersSection?.classList.remove('hidden');
      loadUsers();
    } else {
      adminUsersSection?.classList.add('hidden');
    }
  } else {
    statusBox.textContent = 'You are browsing as a guest.';
    statusBox.style.background = '#f8d7da';
    statusBox.style.color = '#721c24';
    authForms.classList.remove('hidden');
    userActions.classList.add('hidden');
    modSection.classList.add('hidden');
    notifBell.classList.add('hidden');
    notifDropdown.classList.add('hidden');
    activitySection.classList.add('hidden');
    document.querySelectorAll('.user-only').forEach((el) => el.classList.add('hidden'));

    // إخفاء قسم الحسابات المرتبطة عند الخروج
    const connectedSection = document.getElementById('connected-accounts-section');
    if (connectedSection) connectedSection.classList.add('hidden');

    // D2: إخفاء قسم إدارة التصنيفات عند الخروج
    document.getElementById('admin-categories-section')?.classList.add('hidden');

    // D3: إخفاء قسم إدارة المستخدمين عند الخروج
    document.getElementById('admin-users-section')?.classList.add('hidden');
  }

  await loadCategoryCheckboxes();
  await loadFilterCategories();
  await loadPosts();
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  document
    .getElementById('login-btn')
    .addEventListener('click', (e) => withLoading(e.currentTarget, login));
  document
    .getElementById('register-btn')
    .addEventListener('click', (e) => withLoading(e.currentTarget, register));
  document
    .getElementById('logout-btn')
    .addEventListener('click', (e) => withLoading(e.currentTarget, logout));
  document
    .getElementById('create-post-btn')
    .addEventListener('click', (e) => withLoading(e.currentTarget, createPost));

  document.getElementById('filter-all')?.addEventListener('click', () => {
    state.filter = { type: 'all' };
    state.page = 1;
    updateFilterButtons();
    loadPosts();
  });
  document.getElementById('filter-my-posts')?.addEventListener('click', filterByMyPosts);
  document.getElementById('filter-my-likes')?.addEventListener('click', filterByMyLikes);

  checkSession();
  loadSsoProviders();
});

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const { ok, body } = await api('/login', { method: 'POST', body: { username, password } });
  if (ok) {
    setMessage('Login successful');
    document.getElementById('login-password').value = '';
    await checkSession();
  } else {
    setMessage(body.error || 'Login failed');
  }
}

async function register() {
  const email = document.getElementById('reg-email').value.trim();
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const { ok, body } = await api('/register', {
    method: 'POST',
    body: { username, email, password },
  });
  if (ok) {
    setMessage('Registration successful — you can log in now');
    document.getElementById('reg-email').value = '';
    document.getElementById('reg-username').value = '';
    document.getElementById('reg-password').value = '';
  } else {
    setMessage(body.error || 'Registration failed');
  }
}

async function logout() {
  await api('/logout', { method: 'POST' });
  state.filter = { type: 'all' };
  state.page = 1;
  setMessage('');
  await checkSession();
}

// ---------------------------------------------------------------------------
// SSO
// ---------------------------------------------------------------------------
async function loadSsoProviders() {
  try {
    const { ok, body } = await api('/auth/providers');
    if (!ok) return;
    const container = document.getElementById('sso-buttons');
    const hint = document.getElementById('sso-hint');
    if (!container) return;
    let anyEnabled = false;
    for (const [name, enabled] of Object.entries(body.providers || {})) {
      const btn = container.querySelector(`[data-provider="${name}"]`);
      if (!btn || !enabled) continue;
      btn.hidden = false;
      anyEnabled = true;
      btn.addEventListener('click', () => {
        const redirect = encodeURIComponent(window.location.pathname || '/');
        window.location.href = `/auth/${name}?redirect_to=${redirect}`;
      });
    }
    if (!anyEnabled) hint.classList.remove('hidden');
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
async function loadCategoryCheckboxes() {
  const { ok, body } = await api('/api/categories');
  if (!ok) return;
  const container = document.getElementById('categories-container');
  container.innerHTML = '<p style="margin-bottom:5px;">Select Categories:</p>';
  for (const cat of body) {
    const label = document.createElement('label');
    label.className = 'category-checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = cat.id;
    label.appendChild(input);
    label.appendChild(document.createTextNode(' ' + cat.name));
    container.appendChild(label);
  }
}

async function loadFilterCategories() {
  const { ok, body } = await api('/api/categories');
  if (!ok) return;
  const container = document.getElementById('filter-categories-container');
  container.innerHTML = '';
  for (const cat of body) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-cat-btn';
    btn.textContent = cat.name;
    btn.addEventListener('click', () => filterByCategory(cat.name, btn));
    container.appendChild(btn);
  }
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------
async function loadPosts() {
  const params = new URLSearchParams();
  if (state.filter.type === 'category') params.append('category', state.filter.value);
  if (state.filter.type === 'my_posts') params.append('filter', 'my_posts');
  if (state.filter.type === 'my_likes') params.append('filter', 'my_likes');
  params.append('page', state.page);
  params.append('pageSize', state.pageSize);

  const { ok, body } = await api('/api/posts?' + params.toString());
  const container = document.getElementById('posts-list');
  container.innerHTML = '';

  if (!ok) {
    container.innerHTML = `<p style="text-align:center; color:#c0392b;">${escapeHtml(body.error || 'Failed to load posts')}</p>`;
    document.getElementById('pagination').innerHTML = '';
    return;
  }
  if (body.data.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:#7f8c8d;">No posts found.</p>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  for (const post of body.data) {
    const div = document.createElement('div');
    div.className = 'post-card';
    const isOwner = state.isLoggedIn && post.user_id === state.userId;
    const isOther = state.isLoggedIn && post.user_id !== state.userId;

    div.innerHTML = `
      <h4>${escapeHtml(post.title)}</h4>
      <div class="meta">By ${escapeHtml(post.author)} | ${escapeHtml(new Date(post.created_at).toLocaleString())}</div>
      <p>${escapeHtml(post.content)}</p>
      <div class="categories">Categories: ${escapeHtml((post.categories || []).join(', ') || 'General')}</div>
      ${
        isOwner
          ? `
        <div class="post-actions">
          <button type="button" class="btn-edit-post" data-edit-post="${post.id}">Edit</button>
          <button type="button" class="btn-delete-post" data-delete-post="${post.id}">Delete</button>
          <button type="button" class="btn-add-image" data-add-image="${post.id}">Add Image</button>
          <input type="file" id="add-image-${post.id}" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none;" data-add-image-input="${post.id}" />
        </div>
      `
          : ''
      }
      ${
        isOther
          ? `
        <div class="post-actions">
          <button type="button" class="btn-report-post" data-report-post="${post.id}" style="background: #e74c3c;">Report</button>
        </div>
      `
          : ''
      }
      <div id="media-${post.id}" class="post-media"></div>
      <div class="likes-section">
        <button type="button" class="like-btn" data-action="like" data-post="${post.id}">Like (${post.likes_count || 0})</button>
        <button type="button" class="dislike-btn" data-action="dislike" data-post="${post.id}">Dislike (${post.dislikes_count || 0})</button>
      </div>
      <button type="button" class="comments-toggle-btn" data-toggle-comments="${post.id}">Comments (${post.comments_count || 0})</button>
      <div id="comments-section-${post.id}" class="comments-section" style="display:none;">
        <div id="comments-${post.id}"></div>
        ${
          state.isLoggedIn
            ? `
          <textarea id="comment-input-${post.id}" class="comment-input" placeholder="Write a comment..." rows="2" maxlength="2000"></textarea>
          <button type="button" class="add-comment-btn" data-add-comment="${post.id}">Add Comment</button>
        `
            : '<p style="color:#7f8c8d; font-size:.9em; text-align:center; margin-top:10px;">Login to comment</p>'
        }
      </div>
    `;
    container.appendChild(div);
  }

  container.querySelectorAll('[data-action][data-post]').forEach((btn) => {
    btn.addEventListener('click', (e) =>
      withLoading(e.currentTarget, () => reactToPost(btn.dataset.post, btn.dataset.action))
    );
  });

  container.querySelectorAll('[data-toggle-comments]').forEach((btn) => {
    btn.addEventListener('click', () => toggleComments(btn.dataset.toggleComments));
  });

  container.querySelectorAll('[data-add-comment]').forEach((btn) => {
    btn.addEventListener('click', (e) =>
      withLoading(e.currentTarget, () => addComment(btn.dataset.addComment))
    );
  });

  container.querySelectorAll('[data-edit-post]').forEach((btn) => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.editPost));
  });
  container.querySelectorAll('[data-delete-post]').forEach((btn) => {
    btn.addEventListener('click', () => deletePost(btn.dataset.deletePost));
  });

  container.querySelectorAll('[data-add-image]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById(`add-image-${btn.dataset.addImage}`).click();
    });
  });
  container.querySelectorAll('[data-add-image-input]').forEach((input) => {
    input.addEventListener('change', async (e) => {
      if (!e.target.files.length) return;
      const postId = input.dataset.addImageInput;
      const formData = new FormData();
      formData.append('file', e.target.files[0]);
      const res = await api(`/api/posts/${postId}/media`, { method: 'POST', body: formData });
      if (res.ok) {
        setMessage('Image added successfully!');
        await loadPostMedia(postId);
      } else {
        setMessage(res.body.error || 'Failed to add image');
      }
      e.target.value = '';
    });
  });

  container.querySelectorAll('[data-report-post]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openReportModal('post', parseInt(btn.dataset.reportPost, 10));
    });
  });

  for (const post of body.data) {
    loadPostMedia(post.id).catch(() => {});
  }

  renderPagination(body.pagination);
}

function renderPagination({ page, pageSize, total }) {
  const container = document.getElementById('pagination');
  container.innerHTML = '';
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return;
  for (let i = 1; i <= pages; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(i);
    if (i === page) b.classList.add('active');
    b.addEventListener('click', () => {
      state.page = i;
      loadPosts();
    });
    container.appendChild(b);
  }
}

async function createPost() {
  const title = document.getElementById('post-title').value.trim();
  const content = document.getElementById('post-content').value.trim();
  const categoryIds = Array.from(
    document.querySelectorAll('#categories-container input[type="checkbox"]:checked')
  ).map((cb) => parseInt(cb.value, 10));

  if (!title || !content || categoryIds.length === 0) {
    setMessage('Please fill all fields and select at least one category.');
    return;
  }

  const { ok, body } = await api('/api/posts', {
    method: 'POST',
    body: { title, content, categoryIds },
  });

  if (ok) {
    setMessage('Post created successfully!');
    document.getElementById('post-title').value = '';
    document.getElementById('post-content').value = '';
    document
      .querySelectorAll('#categories-container input:checked')
      .forEach((c) => (c.checked = false));

    const fileInput = document.getElementById('post-media');
    if (fileInput && fileInput.files.length > 0) {
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      const mediaRes = await api(`/api/posts/${body.id}/media`, {
        method: 'POST',
        body: formData,
      });
      if (mediaRes.ok) {
        setMessage('Post and Media uploaded successfully!');
      } else {
        setMessage('Post created, but media upload failed: ' + (mediaRes.body.error || ''));
      }
      fileInput.value = '';
    }
    state.page = 1;
    await loadPosts();
  } else {
    setMessage(body.error || 'Failed to create post');
  }
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------
async function reactToPost(postId, action) {
  const { ok, body } = await api(`/api/posts/${postId}/${action}`, { method: 'POST' });
  if (!ok) {
    setMessage(body.error || 'Failed');
    return;
  }
  await loadPosts();
}

async function reactToComment(commentId, action, postId) {
  const { ok, body } = await api(`/api/comments/${commentId}/${action}`, { method: 'POST' });
  if (!ok) {
    setMessage(body.error || 'Failed');
    return;
  }
  await loadComments(postId);
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------
async function toggleComments(postId) {
  const section = document.getElementById(`comments-section-${postId}`);
  if (section.style.display === 'none') {
    section.style.display = 'block';
    await loadComments(postId);
  } else {
    section.style.display = 'none';
  }
}

async function loadComments(postId) {
  const { ok, body } = await api(`/api/posts/${postId}/comments`);
  const container = document.getElementById(`comments-${postId}`);
  if (!container) return;
  container.innerHTML = '';
  if (!ok) {
    container.innerHTML = `<p style="color:#c0392b;">${escapeHtml(body.error || 'Failed to load comments')}</p>`;
    return;
  }
  if (body.length === 0) {
    container.innerHTML =
      '<p style="color:#7f8c8d; font-size:.9em; text-align:center;">No comments yet.</p>';
    return;
  }

  for (const c of body) {
    const div = document.createElement('div');
    div.className = 'comment-card';
    const isOther = state.isLoggedIn && c.user_id !== state.userId;
    const isOwner = state.isLoggedIn && c.user_id === state.userId;

    div.innerHTML = `
      <span class="comment-author">${escapeHtml(c.author)}</span>
      <span class="comment-date">${escapeHtml(new Date(c.created_at).toLocaleString())}</span>
      <p style="margin:5px 0;">${escapeHtml(c.content)}</p>
      <div class="likes-section">
        <button type="button" class="like-btn" data-caction="like" data-comment="${c.id}" data-post="${postId}">Like (${c.likes_count || 0})</button>
        <button type="button" class="dislike-btn" data-caction="dislike" data-comment="${c.id}" data-post="${postId}">Dislike (${c.dislikes_count || 0})</button>
        ${
          isOwner
            ? `
          <button type="button" class="btn-edit-comment" data-edit-comment="${c.id}" data-post="${postId}" style="flex: 0; padding: 8px 12px; font-size: 12px; width: auto;">Edit</button>
          <button type="button" class="btn-delete-comment" data-delete-comment="${c.id}" data-post="${postId}" style="flex: 0; padding: 8px 12px; font-size: 12px; width: auto;">Delete</button>
        `
            : ''
        }
        ${isOther ? `<button type="button" class="btn-report-comment" data-report-comment="${c.id}" style="background: #e74c3c; flex: 0; padding: 8px 12px; font-size: 12px; width: auto;">Report</button>` : ''}
      </div>
    `;
    container.appendChild(div);
  }

  container.querySelectorAll('[data-caction]').forEach((btn) => {
    btn.addEventListener('click', (e) =>
      withLoading(e.currentTarget, () =>
        reactToComment(btn.dataset.comment, btn.dataset.caction, btn.dataset.post)
      )
    );
  });

  container.querySelectorAll('[data-report-comment]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openReportModal('comment', parseInt(btn.dataset.reportComment, 10));
    });
  });

  // D1: Comment edit/delete handlers
  container.querySelectorAll('[data-edit-comment]').forEach((btn) => {
    btn.addEventListener('click', () =>
      openCommentEditModal(btn.dataset.editComment, btn.dataset.post)
    );
  });

  container.querySelectorAll('[data-delete-comment]').forEach((btn) => {
    btn.addEventListener('click', () =>
      deleteCommentUI(btn.dataset.deleteComment, btn.dataset.post)
    );
  });
}

async function addComment(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  const content = input.value.trim();
  if (!content) {
    setMessage('Comment cannot be empty.');
    return;
  }
  const { ok, body } = await api(`/api/posts/${postId}/comments`, {
    method: 'POST',
    body: { content },
  });
  if (ok) {
    input.value = '';
    await loadComments(postId);
    await loadPosts();
  } else {
    setMessage(body.error || 'Failed to add comment');
  }
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------
async function loadPostMedia(postId) {
  const { ok, body } = await api(`/api/posts/${postId}/media`);
  if (!ok || !Array.isArray(body)) return;
  const container = document.getElementById(`media-${postId}`);
  if (!container) return;
  container.innerHTML = '';
  for (const m of body) {
    const img = document.createElement('img');
    img.src = m.url;
    img.alt = 'Post media';
    img.loading = 'lazy';
    container.appendChild(img);
  }
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
function filterByMyPosts() {
  state.filter = { type: 'my_posts' };
  state.page = 1;
  updateFilterButtons();
  loadPosts();
}

function filterByMyLikes() {
  state.filter = { type: 'my_likes' };
  state.page = 1;
  updateFilterButtons();
  loadPosts();
}

function filterByCategory(categoryName, btnElement) {
  state.filter = { type: 'category', value: categoryName };
  state.page = 1;
  updateFilterButtons();
  document.querySelectorAll('.filter-cat-btn').forEach((b) => b.classList.remove('active'));
  btnElement.classList.add('active');
  loadPosts();
}

function updateFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.filter-cat-btn').forEach((b) => b.classList.remove('active'));
  const btns = document.querySelectorAll('.filter-btn');
  if (state.filter.type === 'all' && btns[0]) btns[0].classList.add('active');
  if (state.filter.type === 'my_posts' && btns[1]) btns[1].classList.add('active');
  if (state.filter.type === 'my_likes' && btns[2]) btns[2].classList.add('active');
}

// ============================================================================
// Moderation Dashboard (F05)
// ============================================================================
async function loadModerationDashboard() {
  const { ok, body } = await api('/api/moderation/queue');
  if (ok) {
    renderModList('mod-queue-posts', body.posts, 'post');
    renderModList('mod-queue-comments', body.comments, 'comment');
  }
  const rep = await api('/api/moderation/reports');
  if (rep.ok) renderReports(rep.body);
}

function renderModList(elementId, items, type) {
  const container = document.getElementById(elementId);
  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = '<p style="color:#7f8c8d; font-size:.9em;">Nothing pending.</p>';
    return;
  }
  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'mod-card';
    const title = type === 'post' ? item.title : item.content;
    div.innerHTML = `
      <h5>${escapeHtml(title)}</h5>
      <div class="meta">By ${escapeHtml(item.author)}</div>
      <div class="mod-actions">
        <button class="btn-approve" data-action="approved">Approve</button>
        <button class="btn-reject" data-action="rejected">Reject</button>
      </div>
    `;
    div.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        updateModStatus(type, item.id, btn.dataset.action);
      });
    });
    container.appendChild(div);
  });
}

async function updateModStatus(type, id, status) {
  const url = `/api/moderation/${type}s/${id}/status`;
  const { ok } = await api(url, { method: 'PATCH', body: { status } });
  if (ok) {
    setMessage(`${type} ${status}`);
    loadModerationDashboard();
    if (type === 'post') loadPosts();
  }
}

function renderReports(reports) {
  const container = document.getElementById('mod-reports');
  container.innerHTML = '';
  if (reports.length === 0) {
    container.innerHTML = '<p style="color:#7f8c8d; font-size:.9em;">No open reports.</p>';
    return;
  }
  reports.forEach((r) => {
    const div = document.createElement('div');
    div.className = 'mod-card';
    div.innerHTML = `
      <h5>Report #${r.id} (${r.target_type} #${r.target_id})</h5>
      <p>Reason: ${escapeHtml(r.reason)}</p>
      <div class="mod-actions">
        <button class="btn-resolve" data-action="resolved">Resolve</button>
        <button class="btn-reject" data-action="dismissed">Dismiss</button>
      </div>
    `;
    div.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const { ok } = await api(`/api/moderation/reports/${r.id}`, {
          method: 'PATCH',
          body: { status: btn.dataset.action },
        });
        if (ok) loadModerationDashboard();
      });
    });
    container.appendChild(div);
  });
}

// ============================================================================
// D2: Admin Categories Management
// ============================================================================

async function loadAdminCategories() {
  const { ok, body } = await api('/api/categories');
  if (!ok) return;

  const container = document.getElementById('categories-admin-list');
  if (!container) return;

  container.innerHTML = '';
  if (body.length === 0) {
    container.innerHTML = '<p style="color:#7f8c8d; margin: 5px 0;">No categories yet.</p>';
    return;
  }

  for (const cat of body) {
    const div = document.createElement('div');
    div.className = 'mod-card';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.innerHTML = `
      <div style="flex: 1;">
        <strong>${escapeHtml(cat.name)}</strong>
        <span style="color: #7f8c8d; font-size: 0.85em; margin-left: 8px;">(id: ${cat.id})</span>
      </div>
    `;
    container.appendChild(div);
  }
}

async function addCategory() {
  const input = document.getElementById('new-category-name');
  const errorEl = document.getElementById('category-error');
  const name = input.value.trim();

  errorEl.textContent = '';

  if (name.length < 2 || name.length > 50) {
    errorEl.textContent = 'Category name must be 2-50 characters.';
    return;
  }

  const { ok, body } = await api('/api/admin/categories', {
    method: 'POST',
    body: { name },
  });

  if (ok) {
    input.value = '';
    await loadAdminCategories();
    await loadCategoryCheckboxes();
    await loadFilterCategories();
    setMessage(`Category "${name}" added.`);
  } else {
    errorEl.textContent = body.error || 'Failed to add category.';
  }
}

// ============================================================================
// D3: Admin User Management
// ============================================================================

async function loadUsers() {
  const { ok, body } = await api('/api/users');
  if (!ok) return;

  const container = document.getElementById('users-admin-list');
  if (!container) return;

  container.innerHTML = '';
  if (body.length === 0) {
    container.innerHTML = '<p style="color:#7f8c8d;">No users found.</p>';
    return;
  }

  for (const user of body) {
    const div = document.createElement('div');
    div.className = 'mod-card';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '10px';

    const isSelf = user.id === state.userId;
    const canChange = !isSelf || user.role === 'admin'; // can't demote self from admin

    // Role badge colors
    const roleColors = {
      admin: '#e74c3c',
      moderator: '#f39c12',
      user: '#95a5a6',
    };

    let roleSelectHtml = '';
    if (canChange) {
      roleSelectHtml = `
        <select data-user-id="${user.id}" data-user-role="${user.role}" class="user-role-select" style="flex: 0; padding: 5px; font-size: 12px; width: auto;">
          <option value="user" ${user.role === 'user' ? 'selected' : ''}>user</option>
          <option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>moderator</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
        </select>
      `;
    } else {
      roleSelectHtml = `<span style="font-size: 12px; color: #7f8c8d;">(you)</span>`;
    }

    div.innerHTML = `
      <div style="flex: 1;">
        <strong>${escapeHtml(user.username)}</strong>
        <span style="color: #7f8c8d; font-size: 0.85em; margin-left: 8px;">${escapeHtml(user.email)}</span>
        <span style="background: ${roleColors[user.role]}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px; margin-left: 8px;">${user.role}</span>
      </div>
      ${roleSelectHtml}
    `;

    container.appendChild(div);
  }

  // Wire up role selects
  container.querySelectorAll('.user-role-select').forEach((select) => {
    select.addEventListener('change', async (e) => {
      const userId = parseInt(e.target.dataset.userId, 10);
      const previousRole = e.target.dataset.userRole;
      const newRole = e.target.value;

      if (previousRole === newRole) return;

      const confirmed = confirm(`Change user's role from "${previousRole}" to "${newRole}"?`);
      if (!confirmed) {
        e.target.value = previousRole; // revert
        return;
      }

      const res = await api(`/api/users/${userId}/role`, {
        method: 'PATCH',
        body: { role: newRole },
      });

      if (res.ok) {
        setMessage(`User role updated to ${newRole}`);
        await loadUsers();
      } else {
        document.getElementById('user-management-error').textContent =
          res.body.error || 'Failed to update role';
        e.target.value = previousRole; // revert
      }
    });
  });
}

// ============================================================================
// Advanced Features (F06)
// ============================================================================
async function loadNotifications() {
  const { ok, body } = await api('/api/notifications');
  if (!ok) return;
  const unread = body.filter((n) => !n.is_read).length;
  const badge = document.getElementById('notif-badge');
  if (unread > 0) {
    badge.textContent = unread;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
  const list = document.getElementById('notif-list');
  list.innerHTML =
    body.length === 0 ? '<p style="color:#7f8c8d; font-size:.9em;">No notifications yet.</p>' : '';
  const icons = { like: '👍', comment: '💬', reply: '↩️' };
  body.forEach((n) => {
    const div = document.createElement('div');
    div.className = `notif-item ${n.is_read ? '' : 'unread'}`;
    div.innerHTML = `
      <span>${icons[n.type] || '🔔'}</span>
      <strong>${escapeHtml(n.actor_name)}</strong>
      ${n.type === 'like' ? 'liked your' : 'commented on your'} ${n.target_type}
      <div style="font-size:.8em; color:#7f8c8d;">${new Date(n.created_at).toLocaleString()}</div>
    `;
    div.addEventListener('click', async () => {
      await api(`/api/notifications/${n.id}/read`, { method: 'PATCH' });
      loadNotifications();
    });
    list.appendChild(div);
  });
}

let editingPost = null;
let editingComment = null; // ← D1: State variable for comment editing

async function openEditModal(postId) {
  const { ok, body } = await api(`/api/posts/${postId}`);
  if (!ok) {
    const listRes = await api('/api/posts?page=1&pageSize=100');
    if (!listRes.ok) return;
    editingPost = listRes.body.data.find((p) => p.id === parseInt(postId, 10));
  } else {
    editingPost = body;
  }
  if (!editingPost) return;
  document.getElementById('edit-title').value = editingPost.title;
  document.getElementById('edit-content').value = editingPost.content;
  document.getElementById('edit-error').textContent = '';
  const catContainer = document.getElementById('edit-categories-container');
  catContainer.innerHTML = '<p style="margin-bottom:5px;">Categories:</p>';
  const catRes = await api('/api/categories');
  if (catRes.ok) {
    catRes.body.forEach((cat) => {
      const label = document.createElement('label');
      label.className = 'category-checkbox';
      const checked = editingPost.categories.includes(cat.name) ? 'checked' : '';
      label.innerHTML = `<input type="checkbox" value="${cat.id}" ${checked}> ${cat.name}`;
      catContainer.appendChild(label);
    });
  }
  document.getElementById('edit-modal').classList.remove('hidden');
}

async function saveEdit() {
  if (!editingPost) return;
  const title = document.getElementById('edit-title').value.trim();
  const content = document.getElementById('edit-content').value.trim();
  const categoryIds = Array.from(
    document.querySelectorAll('#edit-categories-container input:checked')
  ).map((cb) => parseInt(cb.value, 10));
  const { ok, body } = await api(`/api/posts/${editingPost.id}`, {
    method: 'PUT',
    body: { title, content, categoryIds, updatedAt: editingPost.updated_at },
  });
  if (ok) {
    document.getElementById('edit-modal').classList.add('hidden');
    editingPost = null;
    await loadPosts();
  } else {
    document.getElementById('edit-error').textContent = body.error || 'Failed to update';
  }
}

async function deletePost(postId) {
  if (!confirm('Delete this post? This cannot be undone.')) return;
  const { ok, body } = await api(`/api/posts/${postId}`, { method: 'DELETE' });
  if (ok) {
    setMessage('Post deleted');
    await loadPosts();
  } else {
    alert(body.error || 'Failed to delete');
  }
}

// --- F05: Report Content Modal ---
let reportTarget = { type: null, id: null };

function openReportModal(type, id) {
  reportTarget = { type, id };
  document.getElementById('report-reason').value = '';
  document.getElementById('report-error').textContent = '';
  document.getElementById('report-modal').classList.remove('hidden');
}

function closeReportModal() {
  document.getElementById('report-modal').classList.add('hidden');
  reportTarget = { type: null, id: null };
}

async function submitReport() {
  if (!reportTarget.type) return;
  const reason = document.getElementById('report-reason').value.trim();
  if (reason.length < 3) {
    document.getElementById('report-error').textContent = 'Reason must be at least 3 characters.';
    return;
  }
  const { ok, body } = await api('/api/reports', {
    method: 'POST',
    body: { targetType: reportTarget.type, targetId: reportTarget.id, reason },
  });
  if (ok) {
    closeReportModal();
    setMessage('Content reported successfully. Moderators will review it.');
  } else {
    document.getElementById('report-error').textContent = body.error || 'Failed to report';
  }
}

// --- F04: Change Password ---
async function submitPasswordChange() {
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const errorEl = document.getElementById('password-error');
  if (!currentPassword || !newPassword) {
    errorEl.textContent = 'All fields are required';
    return;
  }
  if (newPassword.length < 8 || newPassword.length > 72) {
    errorEl.textContent = 'New password must be 8-72 characters';
    return;
  }
  if (currentPassword === newPassword) {
    errorEl.textContent = 'New password must differ from the current one';
    return;
  }
  const { ok, body } = await api('/api/users/me/password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
  if (ok) {
    document.getElementById('password-modal').classList.add('hidden');
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    setMessage('Password updated successfully!');
  } else {
    errorEl.textContent = body.error || 'Failed to update password';
  }
}

// --- F06: Activity Feed ---
async function loadActivity() {
  const { ok, body } = await api('/api/activity/me');
  if (!ok) return;
  const container = document.getElementById('activity-list');
  container.innerHTML = body.length === 0 ? '<p style="color:#7f8c8d;">No activity yet.</p>' : '';
  const labels = {
    post_create: '📝 Created a post',
    comment_create: '💬 Commented',
    post_edit: '✏️ Edited a post',
    comment_edit: '✏️ Edited a comment',
  };
  body.forEach((a) => {
    const div = document.createElement('div');
    div.className = 'activity-item';
    div.innerHTML = `
      ${labels[a.action] || a.action} (${a.target_type} #${a.target_id})
      <span style="float:right; font-size:.85em; color:#7f8c8d;">${new Date(a.created_at).toLocaleString()}</span>
    `;
    container.appendChild(div);
  });
}

// ============================================================================
// C3: Identity Management
// ============================================================================
async function loadConnectedAccounts() {
  const { ok, body } = await api('/api/users/me/identities');
  if (!ok) return;

  const section = document.getElementById('connected-accounts-section');
  const list = document.getElementById('connected-accounts-list');
  const hint = document.getElementById('connected-accounts-hint');
  if (!section || !list) return;

  section.classList.remove('hidden');
  list.innerHTML = '';

  if (body.identities.length === 0) {
    list.innerHTML = '<p style="color:#7f8c8d; margin: 5px 0;">No SSO providers linked.</p>';
  } else {
    for (const identity of body.identities) {
      const div = document.createElement('div');
      div.className = 'mod-card';
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.justifyContent = 'space-between';
      div.innerHTML = `
        <div style="flex: 1;">
          <strong>${escapeHtml(identity.provider)}</strong>
          <span style="color:#7f8c8d; font-size: 0.9em; margin-left: 8px;">— ${escapeHtml(identity.email || 'no email')}</span>
        </div>
        ${body.canUnlink ? `<button type="button" class="btn-reject" data-unlink="${escapeHtml(identity.provider)}" style="width: auto; padding: 5px 12px; font-size: 12px;">Unlink</button>` : ''}
      `;
      const btn = div.querySelector('[data-unlink]');
      if (btn) {
        btn.addEventListener('click', () => unlinkIdentity(identity.provider));
      }
      list.appendChild(div);
    }
  }

  if (!body.canUnlink) {
    hint.textContent =
      'You have no password set, so you cannot unlink your only provider. Set a password first.';
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }
}

async function unlinkIdentity(provider) {
  if (!confirm(`Unlink ${provider} from your account? You will need to use another login method.`))
    return;
  const { ok, body } = await api(`/api/users/me/identities/${provider}`, { method: 'DELETE' });
  if (ok) {
    setMessage(`${provider} unlinked successfully.`);
    await loadConnectedAccounts();
    await checkSession(); // تحديث حالة الجلسة لضمان الاتساق
  } else {
    setMessage(body.error || 'Failed to unlink');
  }
}

// ============================================================================
// D1: Comment Edit/Delete UI
// ============================================================================

async function openCommentEditModal(commentId, postId) {
  // Fetch current comment data
  const res = await api(`/api/posts/${postId}/comments`);
  if (!res.ok) {
    setMessage('Failed to load comments');
    return;
  }

  const comment = res.body.find((c) => c.id === parseInt(commentId, 10));
  if (!comment) {
    setMessage('Comment not found');
    return;
  }

  editingComment = { id: comment.id, postId: parseInt(postId, 10), updatedAt: comment.updated_at };
  document.getElementById('comment-edit-content').value = comment.content;
  document.getElementById('comment-edit-error').textContent = '';
  document.getElementById('comment-edit-modal').classList.remove('hidden');
}

async function saveCommentEdit() {
  if (!editingComment) return;
  const content = document.getElementById('comment-edit-content').value.trim();
  const errorEl = document.getElementById('comment-edit-error');

  if (!content) {
    errorEl.textContent = 'Content cannot be empty';
    return;
  }
  if (content.length > 2000) {
    errorEl.textContent = 'Content must be at most 2000 characters';
    return;
  }

  const res = await api(`/api/comments/${editingComment.id}`, {
    method: 'PUT',
    body: { content, updatedAt: editingComment.updatedAt },
  });

  if (res.ok) {
    document.getElementById('comment-edit-modal').classList.add('hidden');
    const postId = editingComment.postId;
    editingComment = null;
    await loadComments(postId);
    await loadPosts();
    setMessage('Comment updated');
  } else {
    errorEl.textContent = res.body.error || 'Failed to update comment';
  }
}

async function deleteCommentUI(commentId, postId) {
  if (!confirm('Delete this comment? This cannot be undone.')) return;

  const res = await api(`/api/comments/${commentId}`, { method: 'DELETE' });
  if (res.ok) {
    await loadComments(postId);
    await loadPosts();
    setMessage('Comment deleted');
  } else {
    setMessage(res.body.error || 'Failed to delete comment');
  }
}

// ============================================================================
// Wire up listeners
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('notif-bell')?.addEventListener('click', (e) => {
    if (e.target.closest('#notif-dropdown')) return;
    const dd = document.getElementById('notif-dropdown');
    dd.classList.toggle('hidden');
    if (!dd.classList.contains('hidden')) loadNotifications();
  });

  document
    .getElementById('edit-save-btn')
    ?.addEventListener('click', (e) => withLoading(e.currentTarget, saveEdit));
  document.getElementById('edit-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('edit-modal').classList.add('hidden');
    editingPost = null;
  });

  // D1: Comment edit modal handlers
  document
    .getElementById('comment-edit-save-btn')
    ?.addEventListener('click', (e) => withLoading(e.currentTarget, saveCommentEdit));
  document.getElementById('comment-edit-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('comment-edit-modal').classList.add('hidden');
    editingComment = null;
  });

  // D2: Admin categories handlers
  document
    .getElementById('add-category-btn')
    ?.addEventListener('click', (e) => withLoading(e.currentTarget, addCategory));
  document.getElementById('new-category-name')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCategory();
    }
  });

  document.getElementById('change-password-btn')?.addEventListener('click', () => {
    document.getElementById('password-modal').classList.remove('hidden');
    document.getElementById('password-error').textContent = '';
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
  });
  document.getElementById('cancel-password-btn')?.addEventListener('click', () => {
    document.getElementById('password-modal').classList.add('hidden');
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
  });
  document
    .getElementById('save-password-btn')
    ?.addEventListener('click', (e) => withLoading(e.currentTarget, submitPasswordChange));

  document
    .getElementById('report-submit-btn')
    ?.addEventListener('click', (e) => withLoading(e.currentTarget, submitReport));
  document.getElementById('report-cancel-btn')?.addEventListener('click', closeReportModal);

  setInterval(() => {
    if (state.isLoggedIn) loadNotifications();
  }, 30000);
});
