import { REGIONS } from '../regions';
import { escapeHtml } from '../ui/dom';
import { SITE_NAME, SITE_URL } from '../site';
import { cityLink, cityPath } from './cityPage';
import { page } from './shell';

/**
 * The files a site is expected to have at its root: robots.txt, sitemap.xml and the 404 page.
 * Cloudflare Pages serves 404.html, with a 404 status, for any path that matches no file or
 * function; without it, every unknown path got the map with a 200.
 */

/** Every page worth indexing, as paths. The map itself is one page; share links aren't listed. */
export const sitemapPaths = (): string[] => [
  '/',
  '/insights',
  '/mcp',
  '/privacy',
  '/credits',
  '/faq',
  ...REGIONS.map(cityPath),
];

export const sitemapXml = (
  paths: string[] = sitemapPaths(),
) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `  <url><loc>${escapeHtml(`${SITE_URL}${path}`)}</loc></url>`).join('\n')}
</urlset>
`;

export const robotsTxt = () => `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;

export const notFoundPage = (stylesheet: string) =>
  page({
    head: {
      title: `Page not found | ${SITE_NAME}`,
      description: 'There is no page at this address.',
      path: null,
      stylesheet,
    },
    intro: {
      label: '404',
      title: 'No page here',
      lede: "This page doesn't exist. To see what's under a street, open the map and type an address in the search box at the top, like <i>117 West St, New York</i>.",
      after: '<a class="cta" href="/">Open the map</a>',
    },
    body: `<nav class="block" aria-labelledby="cities-title">
        <h2 id="cities-title">Cities</h2>
        <ul class="city-list">${REGIONS.map(cityLink).join('')}</ul>
      </nav>`,
  });
