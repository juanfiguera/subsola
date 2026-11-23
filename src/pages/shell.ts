import { escapeHtml } from '../ui/dom';
import { themeSwitchHtml } from '../ui/themeToggle';
import { CONTACT_NAV, SHARE_IMAGE, SHARE_IMAGE_ALT, SITE_NAME, SITE_URL } from '../site';

/**
 * The shell every Subsola page outside the map shares: the top bar (logo, site nav with the
 * current page marked, theme switch), the "On this page" nav, the intro and the footer, styled by
 * src/pages/shell.css and brought to life by public/theme.js and public/shell.js.
 *
 * A new page must use it. A page built here goes through page() and is listed in build.ts's
 * pageFiles; a page that can't import it (a static Vite entry, a Pages Function) renders these
 * same pieces, as insights.html does through fillShell() and server/mcp/page.ts does directly.
 * src/pages/shell.test.ts renders every page and fails when one is missing a piece.
 */

export type NavPage = 'map' | 'insights' | 'mcp' | 'faq';

export const SITE_NAV: { page: NavPage; href: string; label: string }[] = [
  { page: 'map', href: '/', label: 'Map' },
  { page: 'insights', href: '/insights', label: 'Insights' },
  { page: 'mcp', href: '/mcp', label: 'AI assistants' },
  { page: 'faq', href: '/faq', label: 'FAQ' },
];

export const FOOT_LINKS: { href: string; label: string }[] = [
  ...SITE_NAV,
  { href: '/credits', label: 'Data credits' },
  { href: '/privacy', label: 'Privacy' },
];

export interface PageHead {
  title: string;
  description: string;
  /** "/seattle". Null for a page with no address of its own, such as the 404 page. */
  path: string | null;
  /** The hashed stylesheet the build emitted. */
  stylesheet: string;
  /** Structured data, already shaped; it's serialized here. */
  jsonLd?: Record<string, unknown>;
}

export interface Intro {
  /** The small line above the title. HTML: callers escape what they put in. */
  label: string;
  title: string;
  lede: string;
  chips?: string[];
  /** After the lede and chips: a call to action, a line of fine print. */
  after?: string;
}

export interface Section {
  id: string;
  title: string;
}

/**
 * JSON in a script element ends at the first "</script>"; escaping "<" keeps any string in it
 * from closing the element early.
 */
export const jsonLdScript = (data: Record<string, unknown>) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

/** The fonts every shell page draws with, Barlow for text and its condensed cut for titles. */
export const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600;700&display=swap';

export const pageHead = ({ title, description, path, stylesheet, jsonLd }: PageHead) => {
  const url = path ? `${SITE_URL}${path}` : null;
  return `<meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#e6e9ee" />
    <script src="/theme.js"></script>
    <script src="/shell.js" defer></script>
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    ${url ? `<link rel="canonical" href="${url}" />` : '<meta name="robots" content="noindex" />'}
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    ${url ? `<meta property="og:url" content="${url}" />` : ''}
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${SHARE_IMAGE}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(SHARE_IMAGE_ALT)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${FONTS_URL}" rel="stylesheet" />
    <link rel="stylesheet" href="/${stylesheet}" />
    ${jsonLd ? jsonLdScript(jsonLd) : ''}`;
};

/** The skip link and the top bar. `current` is the nav entry for this page, if it has one. */
export const topBar = (
  current: NavPage | null,
) => `<a class="skip" href="#main">Skip to the content</a>
    <header class="topbar">
      <a class="brand" href="/" aria-label="${SITE_NAME} map">
        <span class="mark" aria-hidden="true"></span>
        <span>${SITE_NAME}</span>
      </a>
      <nav class="site-nav" aria-label="Site">
        ${SITE_NAV.map(
          ({ page, href, label }) =>
            `<a href="${href}"${page === current ? ' aria-current="page"' : ''}>${label}</a>`,
        ).join('\n        ')}
      </nav>
      <div class="theme-toggle">${themeSwitchHtml({ hidden: true })}</div>
    </header>`;

/** The sections a body links to: every h2 with an id, in order. */
export const sectionsOf = (body: string): Section[] =>
  [...body.matchAll(/<h2\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)].map((match) => ({
    id: match[1]!,
    title: match[2]!.replace(/<[^>]+>/g, '').trim(),
  }));

/** Fewer than three sections fit on one screen, where a list of them is only clutter. */
export const MIN_SECTIONS = 3;

export const sectionNav = (sections: Section[]) =>
  sections.length < MIN_SECTIONS
    ? ''
    : `<nav class="side" aria-label="On this page">
        <p>On this page</p>
        <ol>${sections.map(({ id, title }) => `<li><a href="#${id}">${title}</a></li>`).join('')}</ol>
      </nav>`;

export const intro = ({ label, title, lede, chips, after }: Intro) => `<header class="intro">
        <p class="kicker">${label}</p>
        <h1>${title}</h1>
        <p class="lede">${lede}</p>
        ${chips?.length ? `<ul class="chips" aria-label="At a glance">${chips.map((chip) => `<li class="chip">${chip}</li>`).join('')}</ul>` : ''}
        ${after ?? ''}
      </header>`;

export const siteFoot = () => `<footer class="site-foot">
        ${FOOT_LINKS.map(({ href, label }) => `<a href="${href}">${label}</a>`).join('\n        ')}
        ${CONTACT_NAV}
      </footer>`;

export interface Page {
  head: PageHead;
  current?: NavPage | null;
  intro: Intro;
  body: string;
}

export const page = ({ head, current = null, intro: introParts, body }: Page) => `<!doctype html>
<html lang="en">
  <head>
    ${pageHead(head)}
  </head>
  <body>
    ${topBar(current)}
    <div class="layout">
      ${sectionNav(sectionsOf(body))}
      <main id="main" class="page">
      ${intro(introParts)}
      ${body}
      </main>
      ${siteFoot()}
    </div>
  </body>
</html>
`;

/**
 * The shell for a page Vite builds from its own HTML file (insights.html): its comments
 * `<!--shell:top insights-->` and `<!--shell:foot-->` become the top bar and the footer, so the
 * page shares this code rather than a copy of it. vite.config.ts runs this on every HTML entry.
 */
export const fillShell = (html: string) =>
  html
    .replace(/<!--shell:top(?: (\w+))?-->/g, (_, current?: string) =>
      topBar(SITE_NAV.find((entry) => entry.page === current)?.page ?? null),
    )
    .replaceAll('<!--shell:foot-->', siteFoot());
