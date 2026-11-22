import { escapeHtml } from '../ui/dom';
import { CONTACT_NAV, SHARE_IMAGE, SHARE_IMAGE_ALT, SITE_NAME, SITE_URL } from '../site';

/**
 * The frame every generated page shares: head tags for search and link previews, the top bar,
 * and the footer. The pages are plain HTML written at build time, so crawlers read the text
 * without running the map.
 */

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

/**
 * JSON in a script element ends at the first "</script>"; escaping "<" keeps any string in it
 * from closing the element early.
 */
export const jsonLdScript = (data: Record<string, unknown>) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

export const SITE_LINKS: { href: string; label: string }[] = [
  { href: '/', label: 'Map' },
  { href: '/insights', label: 'Insights' },
  { href: '/mcp', label: 'Use with AI assistants' },
];

export const pageHead = ({ title, description, path, stylesheet, jsonLd }: PageHead) => {
  const url = path ? `${SITE_URL}${path}` : null;
  return `<meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#e6e9ee" />
    <script src="/theme.js"></script>
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
    <link
      href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Barlow:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="/${stylesheet}" />
    ${jsonLd ? jsonLdScript(jsonLd) : ''}`;
};

export const topBar = () => `<a class="skip" href="#main">Skip to the page</a>
    <header class="topbar">
      <a class="brand" href="/" aria-label="${SITE_NAME} map">
        <span class="mark" aria-hidden="true"></span>
        <span>${SITE_NAME}</span>
      </a>
      <nav class="site-nav" aria-label="Site">
        ${SITE_LINKS.map(({ href, label }) => `<a href="${href}">${label}</a>`).join('\n        ')}
      </nav>
    </header>`;

export const pageFoot = () => `<footer class="page-foot">
        ${[
          ...SITE_LINKS,
          { href: '/faq', label: 'Questions' },
          { href: '/credits', label: 'Data credits' },
          { href: '/privacy', label: 'Privacy' },
        ]
          .map(({ href, label }) => `<a href="${href}">${label}</a>`)
          .join('\n        ')}
        ${CONTACT_NAV}
      </footer>`;

export const page = (head: PageHead, main: string) => `<!doctype html>
<html lang="en">
  <head>
    ${pageHead(head)}
  </head>
  <body>
    ${topBar()}
    <main id="main" class="page">
      ${main}
      ${pageFoot()}
    </main>
  </body>
</html>
`;
