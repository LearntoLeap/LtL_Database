// LtL Database — Admin CRUD via GitHub Contents API
const ADMIN = { auth: null, data: null, sha: null, editingId: null, filterQ: '', filterCat: '' };

// ============== Base64 UTF-8 ==============
const toBase64   = (str) => btoa(unescape(encodeURIComponent(str)));
const fromBase64 = (b64) => decodeURIComponent(escape(atob(b64.replace(/\s/g, ''))));

const slugify = (s) => (s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ============== GitHub helpers ==============
async function ghGet(path) {
  const { owner, repo, branch, token } = ADMIN.auth;
  const r = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('GET fail ' + r.status);
  return r.json();
}

async function ghPut(path, contentBase64, sha, message) {
  const { owner, repo, branch, token } = ADMIN.auth;
  const body = { message, content: contentBase64, branch };
  if (sha) body.sha = sha;
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('PUT fail ' + r.status + ' ' + await r.text());
  return r.json();
}

async function saveData(message) {
  const content = JSON.stringify(ADMIN.data, null, 2);
  try {
    const res = await ghPut('data/items.json', toBase64(content), ADMIN.sha, message);
    ADMIN.sha = res.content.sha;
  } catch (e) {
    if (/\b409\b/.test(e.message) || /\b422\b/.test(e.message)) {
      const file = await ghGet('data/items.json');
      if (file) {
        const remote = JSON.parse(fromBase64(file.content));
        ADMIN.sha = file.sha;
        if (JSON.stringify(remote) !== content) {
          if (!confirm('File trên GitHub đã thay đổi từ phiên khác. Ghi đè bằng bản của bạn?')) {
            ADMIN.data = remote;
            renderAdmin();
            return;
          }
        }
        const res = await ghPut('data/items.json', toBase64(content), ADMIN.sha, message + ' (force)');
        ADMIN.sha = res.content.sha;
      }
    } else throw e;
  }
}

// ============== Auth ==============
async function login() {
  const msg = document.getElementById('loginMsg');
  msg.classList.add('hidden');
  const auth = {
    owner: document.getElementById('ghOwner').value.trim(),
    repo:  document.getElementById('ghRepo').value.trim(),
    branch: document.getElementById('ghBranch').value.trim() || 'main',
    token: document.getElementById('ghToken').value.trim()
  };
  if (!auth.owner || !auth.repo || !auth.token) {
    msg.textContent = 'Vui lòng nhập đủ owner, repo, token.';
    msg.classList.remove('hidden');
    return;
  }
  try {
    const r = await fetch(`https://api.github.com/repos/${auth.owner}/${auth.repo}`, {
      headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/vnd.github+json' }
    });
    if (!r.ok) throw new Error('Xác thực thất bại (HTTP ' + r.status + ')');
  } catch (e) {
    msg.textContent = e.message;
    msg.classList.remove('hidden');
    return;
  }
  ADMIN.auth = auth;
  const storage = document.getElementById('ghRemember').checked ? localStorage : sessionStorage;
  storage.setItem('ltldb_auth', JSON.stringify(auth));
  await enterDashboard();
}

function logout() {
  ADMIN.auth = null;
  sessionStorage.removeItem('ltldb_auth');
  localStorage.removeItem('ltldb_auth');
  document.getElementById('loginBox').classList.remove('hidden');
  document.getElementById('dashBox').classList.add('hidden');
  document.getElementById('btnLogout').classList.add('hidden');
}

async function enterDashboard() {
  document.getElementById('loginBox').classList.add('hidden');
  document.getElementById('dashBox').classList.remove('hidden');
  document.getElementById('btnLogout').classList.remove('hidden');
  document.getElementById('repoInfo').textContent = `${ADMIN.auth.owner}/${ADMIN.auth.repo} @ ${ADMIN.auth.branch}`;
  await reloadData();
}

async function reloadData() {
  const list = document.getElementById('adminList');
  list.innerHTML = '<p class="text-slate-500">Đang tải…</p>';
  const file = await ghGet('data/items.json');
  if (!file) {
    // Initialise empty
    ADMIN.data = { categories: defaultCategories(), items: [] };
    ADMIN.sha = null;
  } else {
    ADMIN.data = JSON.parse(fromBase64(file.content));
    ADMIN.sha = file.sha;
  }
  // Populate category selects
  const adminCat = document.getElementById('adminCat');
  const fCat = document.getElementById('fCategory');
  adminCat.innerHTML = '<option value="">Tất cả danh mục</option>';
  fCat.innerHTML = '';
  ADMIN.data.categories.forEach(c => {
    const o1 = document.createElement('option'); o1.value = c.id; o1.textContent = `${c.icon} ${c.name}`; adminCat.appendChild(o1);
    const o2 = document.createElement('option'); o2.value = c.id; o2.textContent = `${c.icon} ${c.name}`; fCat.appendChild(o2);
  });
  renderAdmin();
}

function defaultCategories() {
  return [
    { id: 'drive',   name: 'Google Drive',  icon: '📁' },
    { id: 'youtube', name: 'YouTube',        icon: '▶️' },
    { id: 'press',   name: 'Báo chí / PR',   icon: '📰' },
    { id: 'web',     name: 'Website / Khác', icon: '🔗' }
  ];
}

// ============== List render ==============
function renderAdmin() {
  const list = document.getElementById('adminList');
  list.innerHTML = '';
  document.getElementById('itemCount').textContent = ADMIN.data.items.length;

  let items = ADMIN.data.items.slice();
  if (ADMIN.filterCat) items = items.filter(i => i.category === ADMIN.filterCat);
  if (ADMIN.filterQ) {
    const q = ADMIN.filterQ.toLowerCase();
    items = items.filter(i =>
      (i.title || '').toLowerCase().includes(q) ||
      (i.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
  items.sort((a, b) => (b.publishedAt || b.createdAt || '').localeCompare(a.publishedAt || a.createdAt || ''));

  if (items.length === 0) {
    list.innerHTML = '<p class="text-slate-500 py-6 text-center">Chưa có mục nào. Bấm "➕ Thêm mục".</p>';
    return;
  }

  items.forEach(item => {
    const cat = ADMIN.data.categories.find(c => c.id === item.category);
    const row = document.createElement('div');
    row.className = 'bg-white rounded-lg shadow-sm p-3 flex flex-wrap items-center gap-3';
    row.innerHTML = `
      <div class="text-2xl">${cat ? cat.icon : '🔗'}</div>
      <div class="flex-1 min-w-0">
        <div class="font-semibold truncate">${escapeHtml(item.title)} ${item.featured ? '<span class="text-amber-600 text-xs">★</span>' : ''}</div>
        <div class="text-xs text-slate-500 truncate">${escapeHtml(item.url)}</div>
        <div class="text-xs text-slate-400 mt-0.5">
          ${cat ? cat.name : item.category} ·
          ${item.publishedAt || '—'} ·
          ${item.showThumbnail === false ? '🚫 thumb' : '🖼 thumb'} ·
          ${item.previewable === false ? '🚫 preview' : '👁 preview'}
        </div>
      </div>
      <div class="flex gap-1">
        <button data-act="edit" data-id="${item.id}" class="text-sm px-2 py-1 border rounded hover:bg-slate-50">✏️</button>
        <button data-act="toggleThumb" data-id="${item.id}" class="text-sm px-2 py-1 border rounded hover:bg-slate-50" title="Toggle thumbnail">🖼</button>
        <button data-act="del" data-id="${item.id}" class="text-sm px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50">🗑</button>
      </div>`;
    list.appendChild(row);
  });

  list.querySelectorAll('button[data-act]').forEach(b => {
    b.onclick = () => handleRowAction(b.dataset.act, b.dataset.id);
  });
}

async function handleRowAction(act, id) {
  const item = ADMIN.data.items.find(i => i.id === id);
  if (!item) return;
  if (act === 'edit') openEditor(item);
  else if (act === 'del') {
    if (!confirm(`Xoá "${item.title}"?`)) return;
    ADMIN.data.items = ADMIN.data.items.filter(i => i.id !== id);
    try { await saveData('Delete: ' + item.title); renderAdmin(); }
    catch (e) { alert('Lỗi: ' + e.message); }
  } else if (act === 'toggleThumb') {
    item.showThumbnail = item.showThumbnail === false ? true : false;
    try { await saveData('Toggle thumbnail: ' + item.title); renderAdmin(); }
    catch (e) { alert('Lỗi: ' + e.message); }
  }
}

// ============== Editor ==============
function openEditor(item) {
  ADMIN.editingId = item ? item.id : null;
  document.getElementById('edTitle').textContent = item ? 'Sửa mục' : 'Thêm mục';
  document.getElementById('fTitle').value = item ? item.title : '';
  document.getElementById('fCategory').value = item ? item.category : (ADMIN.data.categories[0]?.id || '');
  document.getElementById('fUrl').value = item ? item.url : '';
  document.getElementById('fDescription').value = item ? (item.description || '') : '';
  document.getElementById('fSource').value = item ? (item.source || '') : '';
  document.getElementById('fPublishedAt').value = item ? (item.publishedAt || '') : new Date().toISOString().slice(0, 10);
  document.getElementById('fTags').value = item ? (item.tags || []).join(', ') : '';
  document.getElementById('fThumbnail').value = item ? (item.thumbnail || '') : '';
  document.getElementById('fShowThumb').checked = item ? item.showThumbnail !== false : true;
  document.getElementById('fPreviewable').checked = item ? item.previewable !== false : true;
  document.getElementById('fFeatured').checked = item ? !!item.featured : false;
  document.getElementById('editorMsg').classList.add('hidden');
  updateUrlHint();
  const m = document.getElementById('editor');
  m.classList.remove('hidden'); m.classList.add('flex');
}

function closeEditor() {
  const m = document.getElementById('editor');
  m.classList.add('hidden'); m.classList.remove('flex');
  ADMIN.editingId = null;
}
window.closeEditor = closeEditor;

function updateUrlHint() {
  const url = document.getElementById('fUrl').value.trim();
  const hint = document.getElementById('urlHint');
  if (!url) { hint.textContent = ''; return; }
  // detectKind & previewEmbedUrl come from app.js
  const kind = (typeof detectKind === 'function') ? detectKind(url) : 'web';
  const embed = (typeof previewEmbedUrl === 'function') ? previewEmbedUrl(url) : null;
  hint.textContent = `Loại: ${kind.toUpperCase()} · ${embed ? 'có thể preview inline ✅' : 'chỉ mở tab mới ↗'}`;
}

async function saveItem() {
  const msg = document.getElementById('editorMsg');
  msg.classList.add('hidden');
  const title = document.getElementById('fTitle').value.trim();
  const url   = document.getElementById('fUrl').value.trim();
  const category = document.getElementById('fCategory').value;
  if (!title || !url || !category) {
    msg.textContent = 'Vui lòng nhập đủ tiêu đề, URL, danh mục.';
    msg.className = 'text-sm text-red-600';
    msg.classList.remove('hidden');
    return;
  }
  const payload = {
    title,
    slug: slugify(title),
    category,
    url,
    description: document.getElementById('fDescription').value.trim(),
    source:      document.getElementById('fSource').value.trim(),
    publishedAt: document.getElementById('fPublishedAt').value,
    tags: document.getElementById('fTags').value.split(',').map(s => s.trim()).filter(Boolean),
    thumbnail:    document.getElementById('fThumbnail').value.trim(),
    showThumbnail: document.getElementById('fShowThumb').checked,
    previewable:   document.getElementById('fPreviewable').checked,
    featured:      document.getElementById('fFeatured').checked
  };

  if (ADMIN.editingId) {
    const idx = ADMIN.data.items.findIndex(i => i.id === ADMIN.editingId);
    ADMIN.data.items[idx] = { ...ADMIN.data.items[idx], ...payload };
  } else {
    payload.id = 'i' + Date.now().toString(36);
    payload.createdAt = new Date().toISOString().slice(0, 10);
    ADMIN.data.items.unshift(payload);
  }

  try {
    msg.textContent = 'Đang lưu…'; msg.className = 'text-sm text-slate-600'; msg.classList.remove('hidden');
    await saveData((ADMIN.editingId ? 'Update: ' : 'Add: ') + title);
    closeEditor();
    renderAdmin();
  } catch (e) {
    msg.textContent = 'Lỗi: ' + e.message;
    msg.className = 'text-sm text-red-600';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// ============== Bootstrap ==============
document.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem('ltldb_auth') || localStorage.getItem('ltldb_auth');
  if (saved) {
    try {
      ADMIN.auth = JSON.parse(saved);
      document.getElementById('ghOwner').value  = ADMIN.auth.owner;
      document.getElementById('ghRepo').value   = ADMIN.auth.repo;
      document.getElementById('ghBranch').value = ADMIN.auth.branch;
      document.getElementById('ghToken').value  = ADMIN.auth.token;
      enterDashboard().catch(e => {
        document.getElementById('loginBox').classList.remove('hidden');
        document.getElementById('dashBox').classList.add('hidden');
      });
    } catch {}
  }
  document.getElementById('btnLogin').onclick = login;
  document.getElementById('btnLogout').onclick = logout;
  document.getElementById('btnReload').onclick = reloadData;
  document.getElementById('btnAdd').onclick = () => openEditor(null);
  document.getElementById('btnSave').onclick = saveItem;
  document.getElementById('fUrl').addEventListener('input', updateUrlHint);
  document.getElementById('adminQ').addEventListener('input', e => { ADMIN.filterQ = e.target.value; renderAdmin(); });
  document.getElementById('adminCat').addEventListener('change', e => { ADMIN.filterCat = e.target.value; renderAdmin(); });
  document.getElementById('editor').addEventListener('click', e => { if (e.target.id === 'editor') closeEditor(); });
});
