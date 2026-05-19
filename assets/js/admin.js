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
  if (!r.ok) {
    const txt = await r.text();
    if (r.status === 403) {
      throw new Error('PUT 403 — PAT không có quyền ghi. Kiểm tra: (1) Permission "Contents: Read and write"; (2) Resource owner = LearntoLeap; (3) Org đã approve PAT (chủ org vào Settings → PAT → Pending requests). Hoặc dùng Classic PAT scope "repo".');
    }
    throw new Error('PUT fail ' + r.status + ' ' + txt);
  }
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

// ============== Categories management ==============
function openCatModal() {
  renderCatList();
  document.getElementById('newCatId').value = '';
  document.getElementById('newCatIcon').value = '';
  document.getElementById('newCatName').value = '';
  document.getElementById('newCatDesc').value = '';
  document.getElementById('catMsg').classList.add('hidden');
  const m = document.getElementById('catModal');
  m.classList.remove('hidden'); m.classList.add('flex');
}
function closeCatModal() {
  const m = document.getElementById('catModal');
  m.classList.add('hidden'); m.classList.remove('flex');
}
window.closeCatModal = closeCatModal;

function catUsageCount(catId) {
  return ADMIN.data.items.filter(i => i.category === catId).length;
}

function getCatDescendants(catId) {
  const out = new Set([catId]);
  let added = true;
  while (added) {
    added = false;
    ADMIN.data.categories.forEach(c => {
      if (c.parent && out.has(c.parent) && !out.has(c.id)) { out.add(c.id); added = true; }
    });
  }
  return out;
}

function indentedCatLabel(c) {
  let depth = 0, cur = c;
  const seen = new Set();
  while (cur.parent && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = ADMIN.data.categories.find(x => x.id === cur.parent);
    if (!cur) break;
    depth++;
  }
  return '  '.repeat(depth) + (c.icon || '📁') + ' ' + c.name;
}

function refreshParentOptions(selectEl, excludeIds = new Set(), selected = '') {
  selectEl.innerHTML = '<option value="">— Folder gốc —</option>';
  // Order by tree DFS so options look hierarchical
  const ordered = [];
  function walk(parent, depth) {
    ADMIN.data.categories
      .filter(c => (c.parent || null) === (parent || null))
      .forEach(c => { ordered.push({ c, depth }); walk(c.id, depth + 1); });
  }
  walk(null, 0);
  ordered.forEach(({ c, depth }) => {
    if (excludeIds.has(c.id)) return;
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = '  '.repeat(depth) + (c.icon || '📁') + ' ' + c.name;
    if (c.id === selected) o.selected = true;
    selectEl.appendChild(o);
  });
}

function renderCatList() {
  const list = document.getElementById('catList');
  list.innerHTML = '';
  if (!ADMIN.data.categories.length) {
    list.innerHTML = '<p class="text-slate-500 text-sm">Chưa có category nào.</p>';
    refreshParentOptions(document.getElementById('newCatParent'));
    return;
  }

  // DFS order so children render under parent
  const ordered = [];
  (function walk(parent, depth) {
    ADMIN.data.categories
      .filter(c => (c.parent || null) === (parent || null))
      .forEach(c => { ordered.push({ c, depth }); walk(c.id, depth + 1); });
  })(null, 0);

  ordered.forEach(({ c, depth }) => {
    const realIdx = ADMIN.data.categories.indexOf(c);
    const used = catUsageCount(c.id);
    const row = document.createElement('div');
    row.className = 'grid grid-cols-12 gap-2 items-center bg-slate-50 rounded-lg p-2';
    row.style.marginLeft = (depth * 16) + 'px';

    // Parent select with self+descendants excluded
    const excl = getCatDescendants(c.id);
    row.innerHTML = `
      <div class="col-span-3 text-xs text-slate-500">
        <code>${escapeHtml(c.id)}</code>
        <span class="ml-1 text-amber-700">${used > 0 ? `· ${used} mục` : ''}</span>
      </div>
      <input data-i="${realIdx}" data-k="icon" value="${escapeHtml(c.icon || '')}" class="col-span-1 border rounded px-1.5 py-1 text-sm text-center">
      <input data-i="${realIdx}" data-k="name" value="${escapeHtml(c.name || '')}" class="col-span-3 border rounded px-2 py-1 text-sm">
      <select data-i="${realIdx}" data-k="parent" class="col-span-3 border rounded px-1.5 py-1 text-sm"></select>
      <div class="col-span-2 flex gap-1 justify-end">
        <button data-up="${realIdx}"  class="px-1.5 py-1 border rounded text-xs hover:bg-white" title="Lên">↑</button>
        <button data-dn="${realIdx}"  class="px-1.5 py-1 border rounded text-xs hover:bg-white" title="Xuống">↓</button>
        <button data-del="${realIdx}" class="px-1.5 py-1 border border-red-200 text-red-600 rounded text-xs hover:bg-red-50" title="Xoá">🗑</button>
      </div>
      <input data-i="${realIdx}" data-k="description" value="${escapeHtml(c.description || '')}" placeholder="Mô tả" class="col-span-12 border rounded px-2 py-1 text-sm">`;

    const sel = row.querySelector('select[data-k="parent"]');
    refreshParentOptions(sel, excl, c.parent || '');
    list.appendChild(row);
  });

  list.querySelectorAll('input[data-i], select[data-i]').forEach(inp => {
    inp.onchange = async () => {
      const i = +inp.dataset.i, k = inp.dataset.k;
      ADMIN.data.categories[i][k] = inp.value.trim();
      await saveCats(`Update category: ${ADMIN.data.categories[i].id}.${k}`);
      renderCatList();
    };
  });
  list.querySelectorAll('button[data-up]').forEach(b => b.onclick = () => moveCat(+b.dataset.up, -1));
  list.querySelectorAll('button[data-dn]').forEach(b => b.onclick = () => moveCat(+b.dataset.dn,  1));
  list.querySelectorAll('button[data-del]').forEach(b => b.onclick = () => deleteCat(+b.dataset.del));

  // Refresh "Thêm mới" parent dropdown
  refreshParentOptions(document.getElementById('newCatParent'));
}

async function saveCats(msg) {
  try {
    await saveData(msg);
    refreshCatSelects();
    renderAdmin();
  } catch (e) {
    setCatMsg('Lỗi: ' + e.message, true);
  }
}

function refreshCatSelects() {
  const adminCat = document.getElementById('adminCat');
  const fCat = document.getElementById('fCategory');
  const curA = adminCat.value, curF = fCat.value;
  adminCat.innerHTML = '<option value="">Tất cả danh mục</option>';
  fCat.innerHTML = '';
  ADMIN.data.categories.forEach(c => {
    const o1 = document.createElement('option'); o1.value = c.id; o1.textContent = `${c.icon} ${c.name}`; adminCat.appendChild(o1);
    const o2 = document.createElement('option'); o2.value = c.id; o2.textContent = `${c.icon} ${c.name}`; fCat.appendChild(o2);
  });
  adminCat.value = curA;
  if (ADMIN.data.categories.find(c => c.id === curF)) fCat.value = curF;
}

async function moveCat(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= ADMIN.data.categories.length) return;
  const arr = ADMIN.data.categories;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  renderCatList();
  await saveCats('Reorder categories');
}

async function deleteCat(i) {
  const c = ADMIN.data.categories[i];
  const used = catUsageCount(c.id);
  if (used > 0) {
    setCatMsg(`Không thể xoá "${c.name}" — còn ${used} mục đang dùng. Hãy chuyển/xoá hết mục trước.`, true);
    return;
  }
  if (!confirm(`Xoá category "${c.name}"?`)) return;
  ADMIN.data.categories.splice(i, 1);
  renderCatList();
  await saveCats('Delete category: ' + c.id);
}

async function addCat() {
  const id   = slugify(document.getElementById('newCatId').value);
  const icon = document.getElementById('newCatIcon').value.trim();
  const name = document.getElementById('newCatName').value.trim();
  const desc = document.getElementById('newCatDesc').value.trim();
  const parent = document.getElementById('newCatParent').value || null;
  if (!id || !name) return setCatMsg('Cần nhập id và tên.', true);
  if (ADMIN.data.categories.find(c => c.id === id)) return setCatMsg('ID đã tồn tại.', true);
  ADMIN.data.categories.push({ id, name, icon: icon || '📁', description: desc, parent });
  renderCatList();
  document.getElementById('newCatId').value = '';
  document.getElementById('newCatIcon').value = '';
  document.getElementById('newCatName').value = '';
  document.getElementById('newCatDesc').value = '';
  document.getElementById('newCatParent').value = '';
  await saveCats('Add category: ' + id);
  setCatMsg('Đã thêm category "' + name + '".', false);
}

function setCatMsg(text, isErr) {
  const el = document.getElementById('catMsg');
  el.textContent = text;
  el.className = 'text-sm mt-2 ' + (isErr ? 'text-red-600' : 'text-emerald-600');
  el.classList.remove('hidden');
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
  document.getElementById('btnManageCats').onclick = openCatModal;
  document.getElementById('btnAddCat').onclick = addCat;
  document.getElementById('catModal').addEventListener('click', e => { if (e.target.id === 'catModal') closeCatModal(); });
  document.getElementById('btnSave').onclick = saveItem;
  document.getElementById('fUrl').addEventListener('input', updateUrlHint);
  document.getElementById('adminQ').addEventListener('input', e => { ADMIN.filterQ = e.target.value; renderAdmin(); });
  document.getElementById('adminCat').addEventListener('change', e => { ADMIN.filterCat = e.target.value; renderAdmin(); });
  document.getElementById('editor').addEventListener('click', e => { if (e.target.id === 'editor') closeEditor(); });
});
