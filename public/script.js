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
    loadRoleRequestStatus();  // ← جديد (P23)

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
    const canChange = !isSelf || user.role === 'admin';

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

  container.querySelectorAll('.user-role-select').forEach((select) => {
    select.addEventListener('change', async (e) => {
      const userId = parseInt(e.target.dataset.userId, 10);
      const previousRole = e.target.dataset.userRole;
      const newRole = e.target.value;

      if (previousRole === newRole) return;

      const confirmed = confirm(`Change user's role from "${previousRole}" to "${newRole}"?`);
      if (!confirmed) {
        e.target.value = previousRole;
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
        setMessage(res.body.error || 'Failed to update user role');
        e.target.value = previousRole;
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Modals & User Actions (Edit, Password, Report, Delete Account, Role Request)
// ---------------------------------------------------------------------------
let currentEditPostId = null;
let currentEditCommentId = null;
let currentEditCommentPostId = null;
let currentReport = { type: null, id: null };

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('add-category-btn')?.addEventListener('click', (e) => {
    withLoading(e.currentTarget, addCategory);
  });

  document.getElementById('change-password-btn')?.addEventListener('click', () => {
    document.getElementById('password-modal').classList.remove('hidden');
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('password-error').textContent = '';
  });

  document.getElementById('cancel-password-btn')?.addEventListener('click', () => {
    document.getElementById('password-modal').classList.add('hidden');
  });

  document.getElementById('save-password-btn')?.addEventListener('click', async (e) => {
    await withLoading(e.currentTarget, changePassword);
  });

  document.getElementById('edit-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('edit-modal').classList.add('hidden');
    currentEditPostId = null;
  });

  document.getElementById('edit-save-btn')?.addEventListener('click', async (e) => {
    await withLoading(e.currentTarget, savePostEdit);
  });

  document.getElementById('report-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('report-modal').classList.add('hidden');
    currentReport = { type: null, id: null };
  });

  document.getElementById('report-submit-btn')?.addEventListener('click', async (e) => {
    await withLoading(e.currentTarget, submitReport);
  });

  document.getElementById('comment-edit-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('comment-edit-modal').classList.add('hidden');
    currentEditCommentId = null;
    currentEditCommentPostId = null;
  });

  document.getElementById('comment-edit-save-btn')?.addEventListener('click', async (e) => {
    await withLoading(e.currentTarget, saveCommentEdit);
  });

  // P23: Role request handlers
  document
    .getElementById('request-moderator-btn')
    ?.addEventListener('click', openRoleRequestModal);
  document
    .getElementById('role-request-submit-btn')
    ?.addEventListener('click', (e) => withLoading(e.currentTarget, submitRoleRequest));
  document
    .getElementById('role-request-cancel-btn')
    ?.addEventListener('click', closeRoleRequestModal);

  // C4: Delete account handlers
  document
    .getElementById('delete-account-btn')
    ?.addEventListener('click', openDeleteAccountModal);
  document
    .getElementById('delete-account-confirm-btn')
    ?.addEventListener('click', (e) => withLoading(e.currentTarget, submitDeleteAccount));
  document
    .getElementById('delete-account-cancel-btn')
    ?.addEventListener('click', closeDeleteAccountModal);

  document.getElementById('notif-bell')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('notif-dropdown');
    dropdown.classList.toggle('hidden');
    if (!dropdown.classList.contains('hidden')) {
      markNotificationsRead();
    }
  });

  document.addEventListener('click', () => {
    document.getElementById('notif-dropdown')?.classList.add('hidden');
  });
});

async function changePassword() {
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const errorEl = document.getElementById('password-error');

  if (!currentPassword || !newPassword) {
    errorEl.textContent = 'All fields are required.';
    return;
  }

  const { ok, body } = await api('/api/users/password', {
    method: 'PATCH',
    body: { currentPassword, newPassword },
  });

  if (ok) {
    document.getElementById('password-modal').classList.add('hidden');
    setMessage('Password changed successfully. All sessions revoked.');
    await checkSession();
  } else {
    errorEl.textContent = body.error || 'Failed to change password.';
  }
}

async function openEditModal(postId) {
  const { ok, body } = await api(`/api/posts/${postId}`);
  if (!ok) {
    setMessage(body.error || 'Failed to load post for editing');
    return;
  }
  currentEditPostId = postId;
  document.getElementById('edit-title').value = body.title;
  document.getElementById('edit-content').value = body.content;
  document.getElementById('edit-error').textContent = '';
  document.getElementById('edit-modal').classList.remove('hidden');
}

async function savePostEdit() {
  const title = document.getElementById('edit-title').value.trim();
  const content = document.getElementById('edit-content').value.trim();
  const errorEl = document.getElementById('edit-error');

  if (!title || !content) {
    errorEl.textContent = 'Title and content cannot be empty.';
    return;
  }

  const { ok, body } = await api(`/api/posts/${currentEditPostId}`, {
    method: 'PATCH',
    body: { title, content },
  });

  if (ok) {
    document.getElementById('edit-modal').classList.add('hidden');
    setMessage('Post updated successfully.');
    await loadPosts();
  } else {
    errorEl.textContent = body.error || 'Failed to update post.';
  }
}

async function deletePost(postId) {
  if (!confirm('Are you sure you want to delete this post?')) return;
  const { ok, body } = await api(`/api/posts/${postId}`, { method: 'DELETE' });
  if (ok) {
    setMessage('Post deleted.');
    await loadPosts();
  } else {
    setMessage(body.error || 'Failed to delete post.');
  }
}

function openReportModal(type, id) {
  currentReport = { type, id };
  document.getElementById('report-reason').value = '';
  document.getElementById('report-error').textContent = '';
  document.getElementById('report-modal').classList.remove('hidden');
}

async function submitReport() {
  const reason = document.getElementById('report-reason').value.trim();
  const errorEl = document.getElementById('report-error');

  if (reason.length < 3) {
    errorEl.textContent = 'Reason must be at least 3 characters.';
    return;
  }

  const { ok, body } = await api('/api/moderation/reports', {
    method: 'POST',
    body: {
      targetType: currentReport.type,
      targetId: currentReport.id,
      reason,
    },
  });

  if (ok) {
    document.getElementById('report-modal').classList.add('hidden');
    setMessage('Content reported successfully.');
  } else {
    errorEl.textContent = body.error || 'Failed to submit report.';
  }
}

function openCommentEditModal(commentId, postId) {
  currentEditCommentId = commentId;
  currentEditCommentPostId = postId;
  document.getElementById('comment-edit-error').textContent = '';
  document.getElementById('comment-edit-modal').classList.remove('hidden');
}

async function saveCommentEdit() {
  const content = document.getElementById('comment-edit-content').value.trim();
  const errorEl = document.getElementById('comment-edit-error');

  if (!content) {
    errorEl.textContent = 'Comment content cannot be empty.';
    return;
  }

  const { ok, body } = await api(`/api/comments/${currentEditCommentId}`, {
    method: 'PATCH',
    body: { content },
  });

  if (ok) {
    document.getElementById('comment-edit-modal').classList.add('hidden');
    setMessage('Comment updated successfully.');
    await loadComments(currentEditCommentPostId);
  } else {
    errorEl.textContent = body.error || 'Failed to update comment.';
  }
}

async function deleteCommentUI(commentId, postId) {
  if (!confirm('Are you sure you want to delete this comment?')) return;
  const { ok, body } = await api(`/api/comments/${commentId}`, { method: 'DELETE' });
  if (ok) {
    setMessage('Comment deleted.');
    await loadComments(postId);
    await loadPosts();
  } else {
    setMessage(body.error || 'Failed to delete comment.');
  }
}

async function loadConnectedAccounts() {
  const container = document.getElementById('connected-accounts-list');
  const section = document.getElementById('connected-accounts-section');
  const hint = document.getElementById('connected-accounts-hint');
  if (!container || !section) return;

  const { ok, body } = await api('/api/users/me/identities');
  if (!ok) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  container.innerHTML = '';

  if (body.length === 0) {
    container.innerHTML = '<p style="color:#7f8c8d; font-size:.9em; margin:0;">No external accounts linked.</p>';
    hint.textContent = 'You can link your Google or GitHub account for easy sign-in.';
    hint.classList.remove('hidden');
    return;
  }

  hint.classList.add('hidden');
  for (const ident of body) {
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'space-between';
    div.style.padding = '8px 12px';
    div.style.background = '#fff';
    div.style.border = '1px solid #ddd';
    div.style.borderRadius = '4px';

    div.innerHTML = `
      <div>
        <strong style="text-transform: capitalize;">${escapeHtml(ident.provider)}</strong>
        <span style="color: #7f8c8d; font-size: 0.85em; margin-left: 8px;">(${escapeHtml(ident.provider_email || 'Linked')})</span>
      </div>
      <button type="button" class="btn-unlink" data-provider="${ident.provider}" style="background: #e74c3c; padding: 4px 10px; font-size: 12px; margin:0;">Unlink</button>
    `;

    div.querySelector('.btn-unlink').addEventListener('click', async (e) => {
      const provider = e.currentTarget.dataset.provider;
      if (!confirm(`Are you sure you want to unlink your ${provider} account?`)) return;

      const res = await api(`/api/users/me/identities/${provider}`, { method: 'DELETE' });
      if (res.ok) {
        setMessage(`Successfully unlinked ${provider} account.`);
        await loadConnectedAccounts();
      } else {
        setMessage(res.body.error || 'Failed to unlink account.');
      }
    });

    container.appendChild(div);
  }
}

// ---------------------------------------------------------------------------
// P23: Role Request UI
// ---------------------------------------------------------------------------
async function loadRoleRequestStatus() {
  if (!state.isLoggedIn) return;

  const btn = document.getElementById('request-moderator-btn');
  const statusEl = document.getElementById('role-request-status');
  if (!btn || !statusEl) return;

  if (state.role === 'admin') {
    btn.classList.add('hidden');
    statusEl.classList.add('hidden');
    return;
  }

  btn.textContent =
    state.role === 'moderator' ? 'Request Admin Promotion' : 'Request Moderator Promotion';

  try {
    const { ok, body } = await api('/api/roles/me');
    if (!ok) {
      btn.classList.remove('hidden');
      return;
    }

    const pending = Array.isArray(body) ? body.find((r) => r.status === 'pending') : null;

    if (pending) {
      btn.classList.add('hidden');
      statusEl.textContent = `⏳ Pending ${pending.requested_role} request awaiting admin review.`;
      statusEl.classList.remove('hidden');
    } else {
      btn.classList.remove('hidden');
      statusEl.classList.add('hidden');
    }
  } catch (_) {
    btn.classList.remove('hidden');
  }
}

function openRoleRequestModal() {
  const role = state.role === 'moderator' ? 'admin' : 'moderator';
  const modal = document.getElementById('role-request-modal');
  modal.querySelector('h3').textContent = `Request ${role.charAt(0).toUpperCase() + role.slice(1)} Role`;

  document.getElementById('role-request-reason').value = '';
  document.getElementById('role-request-error').textContent = '';
  modal.classList.remove('hidden');
}

function closeRoleRequestModal() {
  document.getElementById('role-request-modal').classList.add('hidden');
}

async function submitRoleRequest() {
  const reason = document.getElementById('role-request-reason').value.trim();
  const errorEl = document.getElementById('role-request-error');

  if (reason.length < 10) {
    errorEl.textContent = 'Reason must be at least 10 characters.';
    return;
  }

  const requestedRole = state.role === 'moderator' ? 'admin' : 'moderator';

  const { ok, body } = await api('/api/roles/request', {
    method: 'POST',
    body: { requestedRole, reason },
  });

  if (ok) {
    closeRoleRequestModal();
    setMessage(`✅ ${requestedRole} request submitted. An admin will review it.`);
    await loadRoleRequestStatus();
  } else {
    errorEl.textContent = body.error || 'Failed to submit request';
  }
}

// ---------------------------------------------------------------------------
// C4: Delete Account UI
// ---------------------------------------------------------------------------
async function openDeleteAccountModal() {
  document.getElementById('delete-account-error').textContent = '';

  const promptEl = document.getElementById('delete-account-prompt');
  const passwordInput = document.getElementById('delete-account-password');
  const usernameInput = document.getElementById('delete-account-username-confirm');

  const { ok, body } = await api('/api/users/me/identities');
  const hasPassword = ok && body.hasPassword;

  if (hasPassword) {
    promptEl.textContent = 'Enter your current password to confirm:';
    passwordInput.classList.remove('hidden');
    usernameInput.classList.add('hidden');
    passwordInput.value = '';
  } else {
    promptEl.textContent = `You have no password set. Type your username "${state.username}" to confirm:`;
    passwordInput.classList.add('hidden');
    usernameInput.classList.remove('hidden');
    usernameInput.value = '';
  }

  document.getElementById('delete-account-modal').classList.remove('hidden');
}

function closeDeleteAccountModal() {
  document.getElementById('delete-account-modal').classList.add('hidden');
}

async function submitDeleteAccount() {
  const errorEl = document.getElementById('delete-account-error');
  const passwordField = document.getElementById('delete-account-password');
  const usernameField = document.getElementById('delete-account-username-confirm');

  const payload = {};

  if (!passwordField.classList.contains('hidden')) {
    const password = passwordField.value;
    if (!password) {
      errorEl.textContent = 'Password is required.';
      return;
    }
    payload.password = password;
  } else {
    const confirmation = usernameField.value.trim();
    if (!confirmation) {
      errorEl.textContent = 'Username confirmation is required.';
      return;
    }
    payload.confirmation = confirmation;
  }

  if (!confirm('Are you absolutely sure? This action cannot be undone.')) return;

  const res = await api('/api/users/me', { method: 'DELETE', body: payload });

  if (res.ok) {
    closeDeleteAccountModal();
    setMessage('✅ Account deleted. Redirecting...');
    setTimeout(() => {
      window.location.href = '/';
    }, 1500);
  } else {
    errorEl.textContent = res.body.error || 'Failed to delete account';
  }
}

// ---------------------------------------------------------------------------
// Notifications & Activity (F06)
// ---------------------------------------------------------------------------
async function loadNotifications() {
  const { ok, body } = await api('/api/notifications');
  if (!ok) return;

  const badge = document.getElementById('notif-badge');
  const list = document.getElementById('notif-list');

  const unreadCount = body.filter((n) => !n.is_read).length;
  if (unreadCount > 0) {
    badge.textContent = unreadCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  if (body.length === 0) {
    list.innerHTML = '<p style="color:#7f8c8d; font-size:.9em; margin:0;">No notifications.</p>';
    return;
  }

  list.innerHTML = '';
  for (const n of body) {
    const div = document.createElement('div');
    div.className = `notif-item ${n.is_read ? '' : 'unread'}`;
    div.style.padding = '8px 10px';
    div.style.borderBottom = '1px solid #eee';
    div.style.fontSize = '0.85em';
    div.style.background = n.is_read ? '#fff' : '#f0f8ff';

    div.innerHTML = `
      <div>${escapeHtml(n.message || 'New notification')}</div>
      <div style="color: #999; font-size: 0.8em; margin-top: 2px;">${escapeHtml(new Date(n.created_at).toLocaleString())}</div>
    `;
    list.appendChild(div);
  }
}

async function markNotificationsRead() {
  await api('/api/notifications/read', { method: 'POST' });
  const badge = document.getElementById('notif-badge');
  badge.classList.add('hidden');
  badge.textContent = '0';
}

async function loadActivity() {
  const { ok, body } = await api('/api/users/me/activity');
  const container = document.getElementById('activity-list');
  if (!container || !ok) return;

  container.innerHTML = '';
  if (body.length === 0) {
    container.innerHTML = '<p style="color:#7f8c8d; font-size:.9em;">No recent activity.</p>';
    return;
  }

  for (const act of body) {
    const div = document.createElement('div');
    div.style.padding = '6px 0';
    div.style.borderBottom = '1px solid #eee';
    div.style.fontSize = '0.9em';
    div.innerHTML = `
      <strong>${escapeHtml(act.action_type)}</strong> on ${escapeHtml(act.target_type)} 
      <span style="color: #7f8c8d; font-size: 0.85em; float: right;">${escapeHtml(new Date(act.created_at).toLocaleString())}</span>
    `;
    container.appendChild(div);
  }
}