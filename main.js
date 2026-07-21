/* ===================================================
   Алексей Захарчук — Стихотворения
   main.js v4 — поиск по текстам, история, подсветка
   =================================================== */

const VISITED_KEY    = 'az_visited_poems';
const HISTORY_KEY    = 'az_search_history';
const VISITED_MS     = 2000;
const HISTORY_MAX    = 10;
const SEARCH_DELAY   = 280; // мс debounce

/* ── sessionStorage helpers ── */
function getVisited() {
  try { return JSON.parse(sessionStorage.getItem(VISITED_KEY) || '[]'); }
  catch { return []; }
}
function markVisited(slug) {
  const v = getVisited();
  if (!v.includes(slug)) { v.push(slug); sessionStorage.setItem(VISITED_KEY, JSON.stringify(v)); }
}

/* ── localStorage helpers (история поиска) ── */
function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}
function addHistory(query) {
  query = query.trim();
  if (!query) return;
  let h = getHistory().filter(q => q !== query);
  h.unshift(query);
  if (h.length > HISTORY_MAX) h = h.slice(0, HISTORY_MAX);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
}

/* ── markdown parsers ── */
function parseFrontmatter(text) {
  const fm = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!fm) return { title: '', date: '', body: text.trim() };
  const meta = {};
  fm[1].split('\n').forEach(line => {
    const m = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
    if (m) meta[m[1].trim()] = m[2].trim();
  });
  return { title: meta.title || '', date: meta.date || '', body: fm[2].trim() };
}

function parsePoemText(raw) {
  return raw.split(/\n{2,}/)
    .map(s => {
      const lines = s.trim().split('\n').map(l => l.trimEnd()).filter(Boolean);
      return lines.length ? '<p>' + lines.join('<br>') + '</p>' : '';
    })
    .filter(Boolean)
    .join('\n');
}

/* Подсвечивает все вхождения query в строке html-текста.
   Работает с plain-text содержимым (не ломает теги). */
function highlightText(text, query) {
  if (!query) return escHtml(text);
  const escaped = escHtml(text);
  const re = new RegExp('(' + reEscape(escHtml(query)) + ')', 'gi');
  return escaped.replace(re, '<mark>$1</mark>');
}

function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isMobile() { return window.innerWidth <= 768; }

/* ── state ── */
let poems        = [];   // [{slug, title}]
let poemCache    = {};   // slug → {title, date, body, lines:[]}
let indexReady   = false;
let activeSlug   = null;
let openedAt     = null;
let activeQuery  = '';   // последний поисковый запрос (для подсветки в стихе)
let searchTimer  = null;
const poemList        = document.getElementById('poemList');
const poemDisplay     = document.getElementById('poemDisplay');
const contentPanel    = document.getElementById('contentPanel');
const sidebar         = document.getElementById('sidebar');
const siteFooter      = document.getElementById('siteFooter');
const backToListBtn   = document.getElementById('backToListBtn');
/* ── DOM refs ── */
const poemList        = document.getElementById('poemList');
const poemDisplay     = document.getElementById('poemDisplay');
const contentPanel    = document.getElementById('contentPanel');
const sidebar         = document.getElementById('sidebar');
const siteFooter      = document.getElementById('siteFooter');


const searchOverlay   = document.getElementById('searchOverlay');
const searchInput     = document.getElementById('searchInput');
const searchResults   = document.getElementById('searchResults');
const searchHistory   = document.getElementById('searchHistory');
const searchCloseBtn  = document.getElementById('searchCloseBtn');

/* Все кнопки лупы */
const searchBtns = [
  document.getElementById('searchIconBtn'),
  document.getElementById('searchIconBtnMobile'),
  document.getElementById('searchIconBtnPoem'),
].filter(Boolean);

/* ── copyright year ── */
const year = '© ' + new Date().getFullYear();
['copyrightYear','copyrightYearDesktop'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.textContent = year;
});

/* ═══════════════════════════════════════════════════
   ЗАГРУЗКА ДАННЫХ
   ═══════════════════════════════════════════════════ */

async function loadIndex() {
  try {
    const res = await fetch('poems/index.json');
    if (!res.ok) throw new Error('index.json not found');
    poems = await res.json();
    renderList();

    const hash = location.hash.replace('#', '');
    if (hash && poems.find(p => p.slug === hash)) {
      openPoem(hash, false);
    }

    /* Начать фоновую индексацию */
    indexPoems();
  } catch (e) {
    poemList.innerHTML = '<div class="poem-list-loading">Не удалось загрузить список стихотворений.</div>';
    console.error(e);
  }
}

/* Загружает все стихи в фоне для поиска по текстам */
async function indexPoems() {
  for (const { slug } of poems) {
    if (poemCache[slug]) continue;
    try {
      const res = await fetch('poems/' + slug + '.md');
      if (!res.ok) continue;
      const raw = await res.text();
      const { title, date, body } = parseFrontmatter(raw);
      /* lines — массив строк для поиска и показа фрагментов */
      const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
      poemCache[slug] = { title, date, body, lines };
    } catch { /* пропускаем если не загрузился */ }
  }
  indexReady = true;
}

/* ═══════════════════════════════════════════════════
   СПИСОК СТИХОТВОРЕНИЙ
   ═══════════════════════════════════════════════════ */

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
    item.addEventListener('click', () => openPoem(slug, true));
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') openPoem(slug, true);
    });
    poemList.appendChild(item);
  });
}

/* ═══════════════════════════════════════════════════
   ОТКРЫТИЕ СТИХОТВОРЕНИЯ
   ═══════════════════════════════════════════════════ */

async function openPoem(slug, pushState, query) {
  /* Пометить предыдущее прочитанным */
  if (activeSlug && openedAt && (Date.now() - openedAt >= VISITED_MS)) {
    markVisited(activeSlug);
    const prev = poemList.querySelector('[data-slug="' + activeSlug + '"]');
    if (prev) prev.classList.add('visited');
  }

  activeSlug = slug;
  openedAt   = Date.now();
  activeQuery = query || '';

  document.querySelectorAll('.poem-item').forEach(el =>
    el.classList.toggle('active', el.dataset.slug === slug)
  );

  poemDisplay.innerHTML = '<div class="poem-loading">Загрузка…</div>';

  if (pushState) history.pushState({ slug }, '', '#' + slug);

  if (isMobile()) {
    sidebar.classList.add('hidden-mobile');
    if (siteFooter) siteFooter.classList.add('hidden-mobile');
    contentPanel.classList.add('visible-mobile');
    contentPanel.scrollTop = 0;
  }

  /* Берём из кэша или загружаем */
  let data = poemCache[slug];
  if (!data) {
    try {
      const res = await fetch('poems/' + slug + '.md');
      if (!res.ok) throw new Error('Not found');
      const raw = await res.text();
      const { title, date, body } = parseFrontmatter(raw);
      const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
      data = { title, date, body, lines };
      poemCache[slug] = data;
    } catch {
      poemDisplay.innerHTML = '<div class="poem-loading">Не удалось загрузить стихотворение.</div>';
      return;
    }
  }

  const { title, date, body } = data;

  /* Рендер с подсветкой если есть поисковый запрос */
  const titleHtml = activeQuery
    ? highlightText(title, activeQuery)
    : escHtml(title);

  const bodyHtml = activeQuery
    ? renderBodyWithHighlight(body, activeQuery)
    : parsePoemText(body);

  const dateHtml = date
    ? '<div class="poem-date">' + escHtml(date) + '</div>'
    : '';

  poemDisplay.innerHTML =
    '<div class="poem-inner">' +
    '<h1 class="poem-title">' + titleHtml + '</h1>' +
    '<div class="poem-body">' + bodyHtml + '</div>' +
    dateHtml +
    '</div>';

  /* Прокрутить к первому совпадению */
  if (activeQuery) {
    setTimeout(() => {
      const first = poemDisplay.querySelector('mark');
      if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
  }

  syncSidebarScroll(slug);
}

/* Рендерит тело стихотворения с подсветкой совпадений */
function renderBodyWithHighlight(raw, query) {
  return raw.split(/\n{2,}/)
    .map(stanza => {
      const lines = stanza.trim().split('\n').map(l => l.trimEnd()).filter(Boolean);
      if (!lines.length) return '';
      const highlighted = lines.map(line => highlightText(line, query));
      return '<p>' + highlighted.join('<br>') + '</p>';
    })
    .filter(Boolean)
    .join('\n');
}

/* ═══════════════════════════════════════════════════
   ПОИСК
   ═══════════════════════════════════════════════════ */

function openSearch() {
  searchOverlay.classList.add('open');
  searchOverlay.setAttribute('aria-hidden', 'false');
  searchInput.value = '';
  searchResults.innerHTML = '';
  renderHistoryPanel();
  setTimeout(() => searchInput.focus(), 50);
}

function closeSearch() {
  searchOverlay.classList.remove('open');
  searchOverlay.setAttribute('aria-hidden', 'true');
}

function renderHistoryPanel() {
  const h = getHistory();
  if (!h.length) { searchHistory.innerHTML = ''; return; }

  const title = document.createElement('div');
  title.className = 'search-history-title';
  title.textContent = 'Недавние запросы';

  searchHistory.innerHTML = '';
  searchHistory.appendChild(title);

  h.forEach(q => {
    const item = document.createElement('div');
    item.className = 'search-history-item';
    item.innerHTML = '<span class="search-history-icon">↺</span><span>' + escHtml(q) + '</span>';
    item.addEventListener('click', () => {
      searchInput.value = q;
      runSearch(q);
    });
    searchHistory.appendChild(item);
  });
}

function runSearch(query) {
  query = query.trim();

  if (!query) {
    searchResults.innerHTML = '';
    renderHistoryPanel();
    return;
  }

  searchHistory.innerHTML = '';

  if (!indexReady) {
    searchResults.innerHTML = '<div class="search-indexing">Идёт индексация стихотворений…<br>Попробуйте через несколько секунд.</div>';
    return;
  }

  const q = query.toLowerCase();
  const matches = [];

  poems.forEach(({ slug, title }) => {
    const cached = poemCache[slug];
    if (!cached) return;

    const titleLower = cached.title.toLowerCase();
    const matchingLines = cached.lines.filter(l => l.toLowerCase().includes(q));
    const titleMatch = titleLower.includes(q);

    if (titleMatch || matchingLines.length) {
      matches.push({ slug, title: cached.title, titleMatch, matchingLines });
    }
  });

  renderSearchResults(matches, query);
}

function renderSearchResults(matches, query) {
  searchResults.innerHTML = '';

  if (!matches.length) {
    searchResults.innerHTML = '<div class="search-empty">Ничего не найдено</div>';
    return;
  }

  const status = document.createElement('div');
  status.className = 'search-status';
  status.textContent = 'Найдено: ' + matches.length + ' ' + plural(matches.length, 'стихотворение', 'стихотворения', 'стихотворений');
  searchResults.appendChild(status);

  matches.forEach(({ slug, title, titleMatch, matchingLines }) => {
    /* Показываем заголовок + до 3 строк с совпадением */
    const linesToShow = matchingLines.slice(0, 3);

    const item = document.createElement('div');
    item.className = 'search-result-item';

    const titleEl = document.createElement('div');
    titleEl.className = 'search-result-title';
    titleEl.innerHTML = highlightText(title, query);
    item.appendChild(titleEl);

    linesToShow.forEach(line => {
      const lineEl = document.createElement('div');
      lineEl.className = 'search-result-line';
      lineEl.innerHTML = highlightText(line, query);
      item.appendChild(lineEl);
    });

    if (matchingLines.length > 3) {
      const more = document.createElement('div');
      more.className = 'search-result-line';
      more.style.opacity = '0.5';
      more.style.fontSize = '0.8rem';
      more.textContent = '…ещё ' + (matchingLines.length - 3) + ' ' +
        plural(matchingLines.length - 3, 'строка', 'строки', 'строк');
      item.appendChild(more);
    }

    item.addEventListener('click', () => {
      addHistory(query);
      closeSearch();
      openPoem(slug, true, query);
    });

    searchResults.appendChild(item);
  });
}

function plural(n, one, few, many) {
  const mod10  = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/* ═══════════════════════════════════════════════════
   СОБЫТИЯ
   ═══════════════════════════════════════════════════ */

/* Лупы */
searchBtns.forEach(btn => btn.addEventListener('click', openSearch));
/* Лупы */
searchBtns.forEach(btn => btn.addEventListener('click', openSearch));

/* Кнопка "назад к списку" (мобильная) */
if (backToListBtn) backToListBtn.addEventListener('click', showList);

/* Закрыть */
searchCloseBtn.addEventListener('click', closeSearch);
searchOverlay.addEventListener('click', e => {
  if (e.target === searchOverlay) closeSearch();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSearch();
});

/* Ввод с debounce */
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(searchInput.value), SEARCH_DELAY);
});

/* Нажатие Enter — сохранить в историю и искать */
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q) addHistory(q);
    runSearch(q);
  }
});

/* Кнопка «назад» браузера */
window.addEventListener('popstate', e => {
  if (e.state && e.state.slug) {
    openPoem(e.state.slug, false);
  } else {
    activeSlug  = null;
    openedAt    = null;
    activeQuery = '';
    poemDisplay.innerHTML = '<div class="poem-placeholder"><p>Выберите стихотворение из списка слева</p></div>';
    document.querySelectorAll('.poem-item').forEach(el => el.classList.remove('active'));
    if (isMobile()) showList();
  }
});

/* Синхронизация сайдбара */
function syncSidebarScroll(slug) {
  const item = poemList.querySelector('[data-slug="' + slug + '"]');
  if (item) item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

contentPanel.addEventListener('scroll', () => {
  if (isMobile() || !poems.length) return;
  const ratio = contentPanel.scrollTop /
    (contentPanel.scrollHeight - contentPanel.clientHeight || 1);
  const idx = Math.round(ratio * (poems.length - 1));
  const slug = poems[idx]?.slug;
  if (slug) syncSidebarScroll(slug);
});

/* Возврат к списку (мобильный) */
function showList() {
  if (activeSlug && openedAt && (Date.now() - openedAt >= VISITED_MS)) {
    markVisited(activeSlug);
    const item = poemList.querySelector('[data-slug="' + activeSlug + '"]');
    if (item) item.classList.add('visited');
  }
  contentPanel.classList.remove('visible-mobile');
  sidebar.classList.remove('hidden-mobile');
  if (siteFooter) siteFooter.classList.remove('hidden-mobile');
}

/* Пометить при уходе со страницы */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && activeSlug && openedAt &&
      (Date.now() - openedAt >= VISITED_MS)) {
    markVisited(activeSlug);
  }
});

/* ── старт ── */
loadIndex();
