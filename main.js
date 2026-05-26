/* ===================================================
   Алексей Захарчук — Стихотворения
   main.js
   =================================================== */

const VISITED_KEY = 'az_visited_poems';
const VISITED_THRESHOLD_MS = 2000;

/* ── helpers ── */
function getVisited() {
  try { return JSON.parse(sessionStorage.getItem(VISITED_KEY) || '[]'); }
  catch { return []; }
}
function markVisited(slug) {
  const v = getVisited();
  if (!v.includes(slug)) { v.push(slug); sessionStorage.setItem(VISITED_KEY, JSON.stringify(v)); }
}

/* Simple Markdown → HTML: blank lines = paragraph breaks, preserves line breaks within stanzas */
function parsePoemText(raw) {
  const stanzas = raw.split(/\n{2,}/);
  return stanzas
    .map(s => {
      const lines = s.trim().split('\n').map(l => l.trimEnd()).filter(l => l);
      return lines.length ? '<p>' + lines.join('<br>') + '</p>' : '';
    })
    .filter(Boolean)
    .join('\n');
}

/* Strip YAML frontmatter and return { title, body } */
function parseFrontmatter(text) {
  const fm = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!fm) return { title: '', body: text.trim() };
  const meta = {};
  fm[1].split('\n').forEach(line => {
    const m = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
    if (m) meta[m[1].trim()] = m[2].trim();
  });
  return { title: meta.title || '', body: fm[2].trim() };
}

/* ── state ── */
let poems = [];          // [{ slug, title }]
let activeSlug = null;
let openedAt = null;     // timestamp of current poem open

/* ── DOM refs ── */
const poemList    = document.getElementById('poemList');
const poemDisplay = document.getElementById('poemDisplay');
const contentPanel = document.getElementById('contentPanel');
const sidebar     = document.getElementById('sidebar');
const backBtn     = document.getElementById('backBtn');

/* ── copyright year ── */
document.getElementById('copyrightYear').textContent = '© ' + new Date().getFullYear();

/* ── load poem index ── */
async function loadIndex() {
  try {
    const res = await fetch('poems/index.json');
    if (!res.ok) throw new Error('index.json not found');
    poems = await res.json(); // [{ slug, title }]
    renderList();
  } catch (e) {
    poemList.innerHTML = '<div class="poem-list-loading">Не удалось загрузить список стихотворений.</div>';
    console.error(e);
  }
}

/* ── render sidebar list ── */
function renderList() {
  const visited = getVisited();
  poemList.innerHTML = '';

  poems.forEach(({ slug, title }) => {
    const item = document.createElement('div');
    item.className = 'poem-item' +
      (slug === activeSlug ? ' active' : '') +
      (visited.includes(slug) ? ' visited' : '');
    item.dataset.slug = slug;
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', title);

    const bullet = document.createElement('span');
    bullet.className = 'poem-bullet';
    bullet.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.textContent = title;

    item.appendChild(bullet);
    item.appendChild(label);

    item.addEventListener('click', () => openPoem(slug));
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openPoem(slug); });

    poemList.appendChild(item);
  });
}

/* ── open poem ── */
async function openPoem(slug) {
  if (slug === activeSlug) return;

  /* check if previous poem qualifies as visited */
  if (activeSlug && openedAt && (Date.now() - openedAt >= VISITED_THRESHOLD_MS)) {
    markVisited(activeSlug);
  }

  activeSlug = slug;
  openedAt = Date.now();

  /* update sidebar highlight */
  document.querySelectorAll('.poem-item').forEach(el => {
    const isActive = el.dataset.slug === slug;
    el.classList.toggle('active', isActive);
  });

  /* show loading */
  poemDisplay.innerHTML = '<div class="poem-loading">Загрузка…</div>';

  /* mobile: show content panel */
  if (window.innerWidth <= 768) {
    sidebar.classList.add('hidden-mobile');
    contentPanel.classList.add('visible-mobile');
    backBtn.hidden = false;
    contentPanel.scrollTop = 0;
  }

  try {
    const res = await fetch('poems/' + slug + '.md');
    if (!res.ok) throw new Error('File not found');
    const raw = await res.text();
    const { title, body } = parseFrontmatter(raw);

    poemDisplay.innerHTML =
      '<h1 class="poem-title">' + escHtml(title) + '</h1>' +
      '<div class="poem-title-divider" aria-hidden="true"></div>' +
      '<div class="poem-body">' + parsePoemText(body) + '</div>';

    /* sync sidebar scroll to active item */
    syncSidebarScroll(slug);

  } catch (e) {
    poemDisplay.innerHTML = '<div class="poem-loading">Не удалось загрузить стихотворение.</div>';
    console.error(e);
  }
}

/* ── sync sidebar to active ── */
function syncSidebarScroll(slug) {
  const item = poemList.querySelector('[data-slug="' + slug + '"]');
  if (item) {
    item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/* ── content scroll → sync sidebar ── */
contentPanel.addEventListener('scroll', () => {
  if (window.innerWidth <= 768) return; // mobile: no sync needed
  if (!poems.length) return;

  /* estimate which poem fraction is visible — simple approach:
     map scroll position to poem index proportionally */
  const scrollRatio = contentPanel.scrollTop /
    (contentPanel.scrollHeight - contentPanel.clientHeight || 1);
  const idx = Math.round(scrollRatio * (poems.length - 1));
  const slug = poems[idx]?.slug;
  if (slug) syncSidebarScroll(slug);
});

/* ── back button (mobile) ── */
backBtn.addEventListener('click', () => {
  /* check visited before returning */
  if (activeSlug && openedAt && (Date.now() - openedAt >= VISITED_THRESHOLD_MS)) {
    markVisited(activeSlug);
    /* update visited state in list */
    const item = poemList.querySelector('[data-slug="' + activeSlug + '"]');
    if (item) item.classList.add('visited');
  }

  sidebar.classList.remove('hidden-mobile');
  contentPanel.classList.remove('visible-mobile');
  backBtn.hidden = true;
});

/* ── visited refresh on visibility change (tab/window close equivalent) ── */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (activeSlug && openedAt && (Date.now() - openedAt >= VISITED_THRESHOLD_MS)) {
      markVisited(activeSlug);
    }
  }
});

/* ── escape HTML ── */
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── init ── */
loadIndex();
