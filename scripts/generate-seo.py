#!/usr/bin/env python3
"""Build crawlable poem pages, the public poem index, and sitemap.xml."""

from __future__ import annotations

import html
import json
import re
import shutil
from pathlib import Path


BASE_URL = "https://zaharchuk-stihi.pages.dev"
ROOT = Path(__file__).resolve().parents[1]
POEMS_DIR = ROOT / "poems"
MANIFEST = ROOT / ".seo-pages.json"
MARKER = ".generated-poem-page"

# Прячем интерактивную "обёртку" сайта, пока JS не пометил <html> классом "js".
# Работает только на сгенерированных SEO-страницах отдельных стихотворений:
# без JavaScript посетитель (или бот) увидит только блок <noscript> с текстом.
# С JavaScript main.js мгновенно достраивает полноценный интерфейс сайта.
NOJS_HIDE_CSS = """
    html:not(.js) header.site-header,
    html:not(.js) main.layout,
    html:not(.js) footer.site-footer-desktop,
    html:not(.js) .search-overlay { display: none !important; }
"""


def parse_poem(path: Path) -> dict[str, str | bool]:
    raw = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    match = re.match(r"^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n([\s\S]*)$", raw)
    meta: dict[str, str] = {}
    body = raw
    if match:
        body = match.group(2).strip()
        for line in match.group(1).splitlines():
            field = re.match(r"^(\w+):\s*\"?(.*?)\"?\s*$", line)
            if field:
                meta[field.group(1)] = field.group(2)
    return {
        "slug": path.stem,
        "title": meta.get("title", path.stem),
        "date": meta.get("date", ""),
        "draft": meta.get("draft", "").lower() == "true",
        "body": body,
    }


def poem_body_html(body: str) -> str:
    paragraphs = []
    for part in re.split(r"\n{2,}", body.strip()):
        lines = [html.escape(line.rstrip()) for line in part.splitlines() if line.strip()]
        if lines:
            paragraphs.append("<p>" + "<br>\n".join(lines) + "</p>")
    return "\n".join(paragraphs)


def description(poem: dict[str, str | bool]) -> str:
    text = re.sub(r"\s+", " ", str(poem["body"])).strip()
    return (f"{poem['title']} - стихотворение Алексея Захарчука. {text}")[:155]


def page_html(poem: dict[str, str | bool]) -> str:
    title = html.escape(str(poem["title"]))
    date = html.escape(str(poem["date"]))
    slug = str(poem["slug"])
    canonical = f"{BASE_URL}/{slug}/"
    poem_date = f'<time datetime="{date}">{date}</time>' if date else ""
    body_html = poem_body_html(str(poem["body"]))

    # Данные для гидратации: main.js подхватит их и отрисует стихотворение
    # без лишнего fetch-запроса, сразу открыв нужную страницу как обычный переход по сайту.
    prerender_payload = json.dumps(
        {
            "slug": slug,
            "title": str(poem["title"]),
            "date": str(poem["date"]),
            "body": str(poem["body"]),
        },
        ensure_ascii=False,
    ).replace("</", "<\\/")

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <script>document.documentElement.className += " js";</script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} - Алексей Захарчук</title>
  <meta name="description" content="{html.escape(description(poem), quote=True)}">
  <link rel="canonical" href="{canonical}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="{title} - Алексей Захарчук">
  <meta property="og:description" content="{html.escape(description(poem), quote=True)}">
  <meta property="og:url" content="{canonical}">
  <link rel="stylesheet" href="/style.css">
  <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="shortcut icon" href="/favicon.ico">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <style>{NOJS_HIDE_CSS}</style>
</head>
<body>

  <div class="light-source" aria-hidden="true"></div>

  <!-- Показывается только если JavaScript отключён (боты без JS, читалки и т.п.) -->
  <noscript>
    <style>
      body {{ height: auto; min-height: 100vh; overflow: auto; }}
      .seo-poem {{ position: relative; z-index: 1; max-width: 780px; margin: 0 auto; padding: 3rem 1.5rem; }}
      .seo-poem__back {{ color: var(--gold); text-decoration: none; }}
      .seo-poem h1 {{ margin: 2.5rem 0 0.4rem; color: var(--gold-bright); font-family: var(--font-display); font-weight: 400; }}
      .seo-poem time {{ color: var(--text-dim); }}
      .seo-poem__text {{ margin-top: 2rem; font-family: var(--font-poem); font-size: 1.2rem; line-height: 1.65; }}
      .seo-poem__text p {{ margin: 0 0 1.25rem; }}
    </style>
    <main class="seo-poem">
      <a class="seo-poem__back" href="/">Все стихотворения</a>
      <article>
        <h1>{title}</h1>
        {poem_date}
        <div class="seo-poem__text">{body_html}</div>
      </article>
    </main>
  </noscript>

  <!-- Полноценный интерфейс сайта: скрыт до появления класса "js" на <html> -->
  <header class="site-header" id="siteHeader">
    <div class="header-inner">
      <button class="search-icon-btn" id="searchIconBtn" aria-label="Поиск">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
          <circle cx="6.5" cy="6.5" r="5"/>
          <line x1="10.5" y1="10.5" x2="15" y2="15"/>
        </svg>
      </button>
      <span class="author-name">Алексей Захарчук</span>
    </div>
  </header>

  <main class="layout">

    <aside class="sidebar" id="sidebar" aria-label="Список стихотворений">
      <div class="sidebar-header">
        <h2 class="sidebar-title">Стихи</h2>
        <span class="author-name">Алексей Захарчук</span>
        <button class="search-icon-btn mobile-search-btn" id="searchIconBtnMobile" aria-label="Поиск">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
            <circle cx="6.5" cy="6.5" r="5"/>
            <line x1="10.5" y1="10.5" x2="15" y2="15"/>
          </svg>
        </button>
        <div class="sidebar-divider" aria-hidden="true"></div>
      </div>
      <nav class="poem-list" id="poemList" role="navigation" aria-label="Стихотворения">
        <div class="poem-list-loading">Загрузка…</div>
      </nav>
      <footer class="site-footer" id="siteFooter">
        <span id="copyrightYear"></span> Алексей Захарчук. Все права защищены.
      </footer>
    </aside>

    <section class="content-panel" id="contentPanel" aria-live="polite" aria-label="Текст стихотворения">
      <button class="search-icon-btn poem-search-btn" id="searchIconBtnPoem" aria-label="Поиск">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
          <circle cx="6.5" cy="6.5" r="5"/>
          <line x1="10.5" y1="10.5" x2="15" y2="15"/>
        </svg>
      </button>

      <button class="back-to-list-btn" id="backToListBtn" aria-label="Назад к списку стихотворений">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>

      <div class="pull-indicator" id="pullIndicator" aria-hidden="true"></div>

      <div class="poem-display" id="poemDisplay">
        <div class="poem-loading">Загрузка…</div>
      </div>
    </section>

  </main>

  <footer class="site-footer site-footer-desktop" id="siteFooterDesktop">
    <span id="copyrightYearDesktop"></span> Алексей Захарчук. Все права защищены.
  </footer>

  <div class="search-overlay" id="searchOverlay" aria-hidden="true">
    <div class="search-panel" id="searchPanel" role="dialog" aria-label="Поиск по стихотворениям">
      <div class="search-input-row">
        <svg class="search-input-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
          <circle cx="6.5" cy="6.5" r="5"/>
          <line x1="10.5" y1="10.5" x2="15" y2="15"/>
        </svg>
        <input
          type="search"
          class="search-input"
          id="searchInput"
          placeholder="Поиск по стихотворениям…"
          autocomplete="off"
          spellcheck="false"
        />
        <button class="search-close-btn" id="searchCloseBtn" aria-label="Закрыть поиск">✕</button>
      </div>
      <div class="search-history" id="searchHistory"></div>
      <div class="search-results" id="searchResults"></div>
    </div>
  </div>

  <script>window.__POEM_PRERENDER__ = {prerender_payload};</script>
  <script src="/main.js"></script>
</body>
</html>
"""


def read_order() -> list[str]:
    path = ROOT / "order.txt"
    if not path.exists():
        return []
    return [line.strip() for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.startswith("#")]


def read_manifest() -> list[str]:
    if not MANIFEST.exists():
        return []
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
        return [slug for slug in data.get("slugs", []) if re.fullmatch(r"[a-z0-9-]+", slug)]
    except (json.JSONDecodeError, OSError):
        return []


def remove_stale_pages(current_slugs: set[str]) -> None:
    for slug in read_manifest():
        if slug in current_slugs:
            continue
        page_dir = ROOT / slug
        if (page_dir / MARKER).exists():
            shutil.rmtree(page_dir)


def main() -> None:
    poems = [parse_poem(path) for path in POEMS_DIR.glob("*.md")]
    public = {str(poem["slug"]): poem for poem in poems if not poem["draft"]}
    ordered: list[dict[str, str | bool]] = []
    for slug in read_order():
        if slug in public:
            ordered.append(public.pop(slug))
    ordered.extend(public[slug] for slug in sorted(public))

    (POEMS_DIR / "index.json").write_text(
        json.dumps([{"slug": p["slug"], "title": p["title"]} for p in ordered], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    current_slugs = {str(poem["slug"]) for poem in ordered}
    remove_stale_pages(current_slugs)
    for poem in ordered:
        page_dir = ROOT / str(poem["slug"])
        marker = page_dir / MARKER
        if page_dir.exists() and not marker.exists():
            raise RuntimeError(f"Refusing to overwrite non-generated directory: {page_dir.name}")
        page_dir.mkdir(exist_ok=True)
        marker.write_text("Generated by scripts/generate-seo.py\n", encoding="utf-8")
        (page_dir / "index.html").write_text(page_html(poem), encoding="utf-8")

    urls = [f"  <url><loc>{BASE_URL}/</loc></url>"]
    urls.extend(f"  <url><loc>{BASE_URL}/{poem['slug']}/</loc></url>" for poem in ordered)
    sitemap = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n"
    sitemap += "\n".join(urls) + "\n</urlset>\n"
    (ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8")
    MANIFEST.write_text(json.dumps({"slugs": sorted(current_slugs)}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(ordered)} public poem pages and sitemap.xml")


if __name__ == "__main__":
    main()