// LtL Database — Public storefront logic
const DATA_PATH = 'data/items.json';
const STATE = { data: null, filtered: [], cat: '', q: '', sort: 'newest', openCats: new Set(), selected: new Set() };

// ============== URL helpers (preview + thumbnail) ==============
function detectKind(url) {
  if (!url) return 'web';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/drive\.google\.com|docs\.google\.com/i.test(url)) return 'drive';
  return 'web';
}

function youtubeId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

function driveFileId(url) {
  let m = url.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
  if (m) return { type: 'file', id: m[1] };
  m = url.match(/\/document\/d\/([A-Za-z0-9_-]+)/);
  if (m) return { type: 'document', id: m[1] };
  m = url.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (m) return { type: 'spreadsheets', id: m[1] };
  m = url.match(/\/presentation\/d\/([A-Za-z0-9_-]+)/);
  if (m) return { type: 'presentation', id: m[1] };
  m = url.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return { type: 'file', id: m[1] };
  return null;
}

function previewEmbedUrl(url) {
  const kind = detectKind(url);
  if (kind === 'youtube') {
    const id = youtubeId(url);
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (kind === 'drive') {
    const d = driveFileId(url);
    if (!d) return null;
    if (d.type === 'file') return `https://drive.google.com/file/d/${d.id}/preview`;
    return `https://docs.google.com/${d.type}/d/${d.id}/preview`;
  }
  return null;
}

function autoThumbnail(item) {
  if (item.thumbnail) return item.thumbnail;
  const kind = detectKind(item.url);
  if (kind === 'youtube') {
    const id = youtubeId(item.url);
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
  }
  if (kind === 'drive') {
    const d = driveFileId(item.url);
    if (d) return `https://drive.google.com/thumbnail?id=${d.id}&sz=w400`;
  }
  return '';
}

function catIcon(catId) {
  const c = STATE.data.categories.find(x => x.id === catId);
  return c ? c.icon : '🔗';
}

function catName(catId) {
  const c = STATE.data.categories.find(x => x.id === catId);
  return c ? c.name : catId;
}

// ============== Load + render ==============
async function loadData() {
  const r = await fetch(DATA_PATH + '?t=' + Date.now());
  if (!r.ok) throw new Error('Không tải được data');
  STATE.data = await r.json();
}

function renderCategoryFilter() {
  const sel = document.getElementById('catFilter');
  STATE.data.categories.forEach(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = `${c.icon} ${c.name}`;
    sel.appendChild(o);
  });

  const chips = document.getElementById('catChips');
  const mkChip = (id, label, active) => {
    const b = document.createElement('button');
    b.className = `px-3 py-1.5 rounded-full text-sm border ${active ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-200 hover:border-brand-500'}`;
    b.textContent = label;
    b.onclick = () => { STATE.cat = id; sel.value = id; applyFilters(); };
    return b;
  };
  chips.innerHTML = '';
  chips.appendChild(mkChip('', 'Tất cả', STATE.cat === ''));
  STATE.data.categories.forEach(c => {
    chips.appendChild(mkChip(c.id, `${c.icon} ${c.name}`, STATE.cat === c.id));
  });
}

function applyFilters() {
  let items = STATE.data.items.slice();
  if (STATE.cat) items = items.filter(i => i.category === STATE.cat);
  if (STATE.q) {
    const q = STATE.q.toLowerCase();
    items = items.filter(i =>
      (i.title || '').toLowerCase().includes(q) ||
      (i.description || '').toLowerCase().includes(q) ||
      (i.source || '').toLowerCase().includes(q) ||
      (i.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
  if (STATE.sort === 'title') items.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'vi'));
  else if (STATE.sort === 'featured') items.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  else items.sort((a, b) => (b.publishedAt || b.createdAt || '').localeCompare(a.publishedAt || a.createdAt || ''));

  STATE.filtered = items;
  renderGrid();
  renderCategoryFilter(); // refresh chip highlight
  renderTree();
}

function renderGrid() {
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  grid.innerHTML = '';

  if (STATE.filtered.length === 0) {
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
  }

  STATE.filtered.forEach(item => {
    const showThumb = item.showThumbnail !== false; // default true
    const thumbUrl = showThumb ? autoThumbnail(item) : '';
    const canPreview = item.previewable !== false && !!previewEmbedUrl(item.url);

    const card = document.createElement('article');
    card.className = 'card bg-white rounded-xl shadow-sm overflow-hidden flex flex-col';

    const thumbHtml = showThumb
      ? `<div class="thumb" style="${thumbUrl ? `background-image:url('${thumbUrl}')` : ''}">${thumbUrl ? '' : catIcon(item.category)}</div>`
      : '';

    card.innerHTML = `
      ${thumbHtml}
      <div class="p-4 flex flex-col gap-2 flex-1">
        <div class="flex items-center justify-between gap-2">
          <span class="badge badge-${item.category}">${catIcon(item.category)} ${catName(item.category)}</span>
          ${item.featured ? '<span class="text-xs text-amber-600">★ Nổi bật</span>' : ''}
        </div>
        <h3 class="font-semibold text-slate-900 line-clamp-2">${escapeHtml(item.title)}</h3>
        ${item.description ? `<p class="text-sm text-slate-600 line-clamp-2">${escapeHtml(item.description)}</p>` : ''}
        ${item.source ? `<p class="text-xs text-slate-500">Nguồn: ${escapeHtml(item.source)}</p>` : ''}
        ${(item.tags || []).length ? `<div class="flex flex-wrap gap-1 mt-1">${item.tags.map(t => `<span class="text-xs bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        <div class="flex gap-2 mt-auto pt-3">
          ${canPreview ? `<button class="btn-pv flex-1 bg-brand-600 text-white text-sm px-3 py-2 rounded-lg hover:bg-brand-700">👁 Xem trước</button>` : ''}
          <a href="${item.url}" target="_blank" rel="noopener" class="flex-1 text-center text-sm border border-brand-600 text-brand-700 px-3 py-2 rounded-lg hover:bg-brand-50">↗ Mở</a>
          <button class="btn-copy text-sm border border-slate-300 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50" title="Copy link">📋</button>
        </div>
      </div>`;

    if (canPreview) {
      card.querySelector('.btn-pv').onclick = () => openPreview(item);
    }
    card.querySelector('.btn-copy').onclick = () => copySingleLink(item);
    grid.appendChild(card);
  });

  document.getElementById('count').textContent = `${STATE.filtered.length} / ${STATE.data.items.length} mục`;
}

function openPreview(item) {
  document.getElementById('pvTitle').textContent = item.title;
  document.getElementById('pvOpen').href = item.url;
  const embed = previewEmbedUrl(item.url);
  document.getElementById('pvBody').innerHTML = embed
    ? `<iframe class="preview-frame" src="${embed}" allow="autoplay; encrypted-media" allowfullscreen></iframe>`
    : `<p class="text-slate-600 p-6 text-center">Không thể nhúng. <a href="${item.url}" target="_blank" class="text-brand-700 underline">Mở tab mới</a>.</p>`;
  const modal = document.getElementById('preview');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}
function closePreview() {
  const modal = document.getElementById('preview');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.getElementById('pvBody').innerHTML = '';
}
window.closePreview = closePreview;

// ============== Sidebar tree (nested) ==============
function getChildCats(parentId) {
  return STATE.data.categories.filter(c => (c.parent || null) === (parentId || null));
}
function getDescendantIds(catId) {
  const out = [catId];
  const stack = [catId];
  while (stack.length) {
    const p = stack.pop();
    STATE.data.categories.filter(c => c.parent === p).forEach(c => { out.push(c.id); stack.push(c.id); });
  }
  return out;
}
function cumulativeItemCount(catId) {
  const ids = new Set(getDescendantIds(catId));
  return STATE.data.items.filter(i => ids.has(i.category)).length;
}

function renderTree() {
  const root = document.getElementById('tree');
  if (!root) return;
  root.innerHTML = '';

  // Default: mở tất cả root cats lần đầu
  if (STATE._treeInit !== true) {
    getChildCats(null).forEach(c => STATE.openCats.add(c.id));
    STATE._treeInit = true;
  }

  const topCats = getChildCats(null);
  topCats.forEach(c => root.appendChild(renderCatNode(c, 0)));

  updateCopyBar();
}

function renderCatNode(c, depth) {
  const items = STATE.data.items.filter(i => i.category === c.id);
  const children = getChildCats(c.id);
  const total = cumulativeItemCount(c.id);
  const isOpen = STATE.openCats.has(c.id);
  const hasContent = items.length > 0 || children.length > 0;

  const wrap = document.createElement('div');
  wrap.className = 'mb-0.5';

  const head = document.createElement('button');
  head.className = 'w-full flex items-center gap-1 hover:bg-slate-50 rounded px-2 py-1 font-medium text-slate-700';
  head.style.paddingLeft = (depth * 12 + 8) + 'px';
  head.innerHTML = `
    <span class="w-3 text-xs text-slate-400">${hasContent ? (isOpen ? '▼' : '▶') : '·'}</span>
    <span>${c.icon || '📁'}</span>
    <span class="flex-1 text-left truncate">${escapeHtml(c.name)}</span>
    <span class="text-xs text-slate-400">${total}</span>`;
  head.onclick = () => {
    if (STATE.openCats.has(c.id)) STATE.openCats.delete(c.id);
    else STATE.openCats.add(c.id);
    renderTree();
  };
  wrap.appendChild(head);

  if (isOpen) {
    // child sub-folders first
    children.forEach(sc => wrap.appendChild(renderCatNode(sc, depth + 1)));

    // then items of this category
    if (items.length === 0 && children.length === 0) {
      const p = document.createElement('p');
      p.className = 'text-xs text-slate-400 px-2 py-1';
      p.style.paddingLeft = ((depth + 1) * 12 + 8) + 'px';
      p.textContent = '— trống —';
      wrap.appendChild(p);
    }
    items.forEach(item => wrap.appendChild(renderLeaf(item, depth + 1)));
  }
  return wrap;
}

function renderLeaf(item, depth) {
  const leaf = document.createElement('div');
  leaf.className = 'group flex items-center gap-1 hover:bg-slate-50 rounded px-1 py-1';
  leaf.style.paddingLeft = (depth * 12 + 8) + 'px';
  const checked = STATE.selected.has(item.id) ? 'checked' : '';
  leaf.innerHTML = `
    <input type="checkbox" class="leaf-cb accent-brand-600" ${checked}>
    <button class="leaf-title flex-1 text-left truncate text-slate-700 hover:text-brand-700" title="${escapeHtml(item.title)}">📄 ${escapeHtml(item.title)}</button>
    <button class="leaf-copy opacity-0 group-hover:opacity-100 text-slate-400 hover:text-brand-700 px-1" title="Copy link">📋</button>`;
  leaf.querySelector('.leaf-cb').onchange = e => {
    if (e.target.checked) STATE.selected.add(item.id); else STATE.selected.delete(item.id);
    updateCopyBar();
  };
  leaf.querySelector('.leaf-title').onclick = () => openItemFromTree(item);
  leaf.querySelector('.leaf-copy').onclick = () => copySingleLink(item);
  return leaf;
}

function openItemFromTree(item) {
  const canPreview = item.previewable !== false && !!previewEmbedUrl(item.url);
  if (canPreview) openPreview(item);
  else window.open(item.url, '_blank', 'noopener');
}

function updateCopyBar() {
  const bar = document.getElementById('treeCopyBar');
  const cnt = document.getElementById('selCount');
  if (!bar) return;
  if (STATE.selected.size > 0) {
    bar.classList.remove('hidden');
    cnt.textContent = STATE.selected.size;
  } else {
    bar.classList.add('hidden');
  }
}

// ============== Copy helpers ==============
async function clipboardWrite(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
    return ok;
  }
}

async function copySingleLink(item) {
  const text = `[${item.title}]: ${item.url}`;
  const ok = await clipboardWrite(text);
  toast(ok ? `📋 Đã copy: ${item.title}` : 'Copy thất bại', !ok);
}

async function copyMulti() {
  const items = STATE.data.items.filter(i => STATE.selected.has(i.id));
  if (!items.length) return;
  const text = items.map(i => `[${i.title}]: ${i.url}`).join('\n');
  const ok = await clipboardWrite(text);
  toast(ok ? `📋 Đã copy ${items.length} link` : 'Copy thất bại', !ok);
}

// ============== Toast ==============
let toastTimer = null;
function toast(msg, isErr) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `fixed bottom-6 left-1/2 -translate-x-1/2 text-sm px-4 py-2 rounded-lg shadow-lg z-50 ${isErr ? 'bg-red-600' : 'bg-slate-900'} text-white`;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// ============== Bind ==============
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadData();
    renderCategoryFilter();
    applyFilters();
  } catch (e) {
    document.getElementById('grid').innerHTML = `<p class="text-red-600">Lỗi: ${e.message}</p>`;
  }
  document.getElementById('q').addEventListener('input', e => { STATE.q = e.target.value; applyFilters(); });
  document.getElementById('catFilter').addEventListener('change', e => { STATE.cat = e.target.value; applyFilters(); });
  document.getElementById('sortBy').addEventListener('change', e => { STATE.sort = e.target.value; applyFilters(); });
  document.getElementById('preview').addEventListener('click', e => {
    if (e.target.id === 'preview') closePreview();
  });

  // Sidebar tree controls
  const sb = document.getElementById('sidebar');
  document.getElementById('btnSidebar')?.addEventListener('click', () => {
    sb.classList.toggle('hidden');
    sb.classList.toggle('fixed');
    sb.classList.toggle('inset-0');
    sb.classList.toggle('z-40');
    sb.classList.toggle('bg-slate-900/50');
    sb.classList.toggle('p-4');
  });
  document.getElementById('btnSidebarClose')?.addEventListener('click', () => {
    sb.classList.add('hidden');
    sb.classList.remove('fixed','inset-0','z-40','bg-slate-900/50','p-4');
  });
  document.getElementById('treeExpandAll').onclick = () => {
    STATE.data.categories.forEach(c => STATE.openCats.add(c.id)); // mọi cấp
    renderTree();
  };
  document.getElementById('treeCollapseAll').onclick = () => {
    STATE.openCats.clear();
    renderTree();
  };
  document.getElementById('treeClearSel').onclick = () => {
    STATE.selected.clear();
    renderTree();
  };
  document.getElementById('btnCopyMulti').onclick = copyMulti;
});
