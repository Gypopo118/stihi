/* ===================================================
   Алексей Захарчук — Стихотворения
   main.js  (исправленная версия)
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
  if (!v.includes(slug)) {
    v.push(slug);
    sessionStorage.setItem(VISITED_KEY, JSON.stringify(v));
  }
}

/* Разбивает текст стихотворения на строфы → HTML */
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

/* Извлекает заголовок и тело из YAML-frontmatter */
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

function escHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isMobile() {
  return window.innerWidth <= 768;
}

/* ── state ── */
let poems = [];
let activeSlug = null;
let openedAt = null;

/* ── DOM refs ── */
const poemList     = document.getElementById('poemList');
const poemDisplay  = document.getElementById('poemDisplay');
const contentPanel = document.getElementById('contentPanel');
const sidebar      = document.getElementById('sidebar');
const siteHeader   = document.getElementById('siteHeader');
const siteFooter   = document.getElementById('siteFooter');

/* ── copyright year ── */
document.getElementById('copyrightYear').textContent = '© ' + new Date().getFullYear();

/* ── загрузка списка стихов ── */
async function loadIndex() {
  try {
    const res = await fetch('poems/index.json');
    if (!res.ok) throw new Error('index.json not found');
    poems = await res.json();
    renderList();

    /* Если в URL уже есть якорь (#slug) — открыть сразу */
    const hash = location.hash.replace('#', '');
    if (hash && poems.find(p => p.slug === hash)) {
      openPoem(hash, false); /* false = не пушить в историю повторно */
    }
  } catch (e) {
    poemList.innerHTML = '<div class="poem-list-loading">Не удалось загрузить список стихотворений.</div>';
    console.error(e);
  }
}

/* ── рендер списка в сайдбаре ── */
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

/* ── открыть стихотворение ── */
async function openPoem(slug, pushState) {
  /* Пометить предыдущее как прочитанное если прошло >2с */
  if (activeSlug && openedAt && (Date.now() - openedAt >= VISITED_THRESHOLD_MS)) {
    markVisited(activeSlug);
    const prevItem = poemList.querySelector('[data-slug="' + activeSlug + '"]');
    if (prevItem) prevItem.classList.add('visited');
  }

  activeSlug = slug;
  openedAt = Date.now();

  /* Обновить подсветку в сайдбаре */
  document.querySelectorAll('.poem-item').forEach(el => {
    el.classList.toggle('active', el.dataset.slug === slug);
  });

  /* Показать загрузку */
  poemDisplay.innerHTML = '<div class="poem-loading">Загрузка…</div>';

  /* История браузера: pushState добавляет запись,
     чтобы кнопка "назад" возвращала в список */
  if (pushState) {
    history.pushState({ slug }, '', '#' + slug);
  }

  /* Мобильный режим: скрыть список, показать панель стихотворения */
  if (isMobile()) {
    sidebar.classList.add('hidden-mobile');
    siteHeader.classList.add('hidden-mobile');
    siteFooter.classList.add('hidden-mobile');
    contentPanel.classList.add('visible-mobile');
    contentPanel.scrollTop = 0;
  }

  /* Загрузить и отобразить стихотворение */
  try {
    const res = await fetch('poems/' + slug + '.md');
    if (!res.ok) throw new Error('Not found');
    const raw = await res.text();
    const { title, body } = parseFrontmatter(raw);

    poemDisplay.innerHTML =
      '<h1 class="poem-title">' + escHtml(title) + '</h1>' +
      '<div class="poem-title-divider" aria-hidden="true"></div>' +
      '<div class="poem-body">' + parsePoemText(body) + '</div>';

    syncSidebarScroll(slug);
  } catch (e) {
    poemDisplay.innerHTML = '<div class="poem-loading">Не удалось загрузить стихотворение.</div>';
    console.error(e);
  }
}

/* ── возврат к списку (мобильный) ── */
function showList() {
  /* Пометить как прочитанное если прошло >2с */
  if (activeSlug && openedAt && (Date.now() - openedAt >= VISITED_THRESHOLD_MS)) {
    markVisited(activeSlug);
    const item = poemList.querySelector('[data-slug="' + activeSlug + '"]');
    if (item) item.classList.add('visited');
  }

  contentPanel.classList.remove('visible-mobile');
  sidebar.classList.remove('hidden-mobile');
  siteHeader.classList.remove('hidden-mobile');
  siteFooter.classList.remove('hidden-mobile');
}

/* ── кнопка "назад" в браузере ── */
window.addEventListener('popstate', (e) => {
  if (e.state && e.state.slug) {
    /* Перешли назад к другому стиху */
    openPoem(e.state.slug, false);
  } else {
    /* Вернулись на "главную" (список без якоря) */
    activeSlug = null;
    openedAt = null;
    poemDisplay.innerHTML = '<div class="poem-placeholder"><p>Выберите стихотворение из списка слева</p></div>';
    document.querySelectorAll('.poem-item').forEach(el => el.classList.remove('active'));

    if (isMobile()) {
      showList();
    }
  }
});

/* ── синхронизация сайдбара ── */
function syncSidebarScroll(slug) {
  const item = poemList.querySelector('[data-slug="' + slug + '"]');
  if (item) {
    item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/* ── синхронизация при прокрутке контента (десктоп) ── */
contentPanel.addEventListener('scroll', () => {
  if (isMobile() || !poems.length) return;
  const ratio = contentPanel.scrollTop /
    (contentPanel.scrollHeight - contentPanel.clientHeight || 1);
  const idx = Math.round(ratio * (poems.length - 1));
  const slug = poems[idx]?.slug;
  if (slug) syncSidebarScroll(slug);
});

/* ── пометить как прочитанное при уходе со страницы ── */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (activeSlug && openedAt && (Date.now() - openedAt >= VISITED_THRESHOLD_MS)) {
      markVisited(activeSlug);
    }
  }
});

/* ── старт ── */
loadIndex();
