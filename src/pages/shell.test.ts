import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { docsPage } from '../../server/mcp/page';
import { pageFiles } from './build';
import { FOOT_LINKS, SITE_NAV, fillShell, sectionNav, sectionsOf, type NavPage } from './shell';

/**
 * Holds every page outside the map to the shared shell (src/pages/shell.ts): each page the build
 * writes, every HTML entry Vite builds besides the map, and /mcp. A new page lands in one of those
 * three places, so it can't skip the top bar, the theme switch, the nav or the footer unnoticed.
 */

const ROOT = new URL('../../', import.meta.url);

/** Vite's HTML entries beside the map, as the build serves them. */
const viteEntries = readdirSync(ROOT)
  .filter((name) => name.endsWith('.html') && name !== 'index.html')
  .map((name) => [name, fillShell(readFileSync(new URL(name, ROOT), 'utf8'))] as const);

const generated = Object.entries(pageFiles('assets/pages-abc123.css', {})).filter(([name]) =>
  name.endsWith('.html'),
);

const PAGES: (readonly [string, string])[] = [
  ...generated,
  ...viteEntries,
  ['mcp', docsPage('nonce')],
];

/** The nav entry a page should mark as current, from its file name. */
const currentOf = (name: string): NavPage | null => {
  const path = `/${name.replace(/\.html$/, '')}`;
  return SITE_NAV.find((entry) => entry.href === path)?.page ?? null;
};

const between = (html: string, start: RegExp, end: string) => {
  const from = html.search(start);
  if (from < 0) return null;
  return html.slice(from, html.indexOf(end, from) + end.length);
};

describe('the shared shell, on every page outside the map', () => {
  it('covers the generated pages, the insights page and /mcp', () => {
    const names = PAGES.map(([name]) => name);
    for (const name of ['faq.html', 'credits.html', 'privacy.html', '404.html', 'seattle.html'])
      expect(names).toContain(name);
    expect(names).toContain('insights.html');
    expect(names).toContain('mcp');
  });

  it.each(PAGES)('%s has the skip link, top bar and logo home', (_, html) => {
    expect(html).toContain('<a class="skip" href="#main">');
    expect(html).toContain('<main id="main" class="page"');
    expect(html).toMatch(/<header class="topbar">\s*<a class="brand" href="\/"/);
    expect(html).not.toContain('<!--shell:');
  });

  it.each(PAGES)('%s has the site nav, with only its own entry marked current', (name, html) => {
    const nav = between(html, /<nav class="site-nav" aria-label="Site">/, '</nav>');
    expect(nav, 'site nav').not.toBeNull();
    const links = [...nav!.matchAll(/<a href="([^"]+)"( aria-current="page")?>/g)];
    expect(links.map((link) => link[1])).toEqual(SITE_NAV.map((entry) => entry.href));
    const current = currentOf(name);
    for (const [, href, marked] of links)
      expect(Boolean(marked), href).toBe(SITE_NAV.find((e) => e.href === href)?.page === current);
  });

  it.each(PAGES)('%s has the theme switch and the scripts that run it', (_, html) => {
    expect(html).toMatch(
      /<div class="theme-toggle"><button type="button" class="theme-switch" role="switch" aria-label="Dark mode" hidden>/,
    );
    expect(html).toMatch(/<script (nonce="[^"]+" )?src="\/theme\.js"><\/script>/);
    expect(html).toMatch(/<script (nonce="[^"]+" )?src="\/shell\.js" defer><\/script>/);
  });

  it.each(PAGES)('%s has the footer with every site link', (_, html) => {
    const foot = between(html, /<footer class="site-foot">/, '</footer>');
    expect(foot, 'footer').not.toBeNull();
    for (const { href } of FOOT_LINKS) expect(foot).toContain(`<a href="${href}">`);
  });

  it.each(PAGES)('%s labels its section nav and links it only to its own sections', (_, html) => {
    const nav = between(html, /<nav[^>]* class="side"/, '</nav>');
    if (!nav) return;
    expect(nav).toContain('aria-label="On this page"');
    for (const [, id] of nav.matchAll(/href="#([^"]+)"/g)) expect(html).toContain(`id="${id}"`);
  });

  it.each(PAGES)('%s has an intro: label, title and lede', (_, html) => {
    expect(html).toMatch(
      /<header class="intro">\s*<p class="kicker">[\s\S]+?<\/p>\s*<h1>[\s\S]+?<\/h1>\s*<p class="lede">/,
    );
  });
});

describe('section nav', () => {
  it('lists every h2 with an id, in order, as plain text', () => {
    expect(
      sectionsOf(
        '<h2 id="a">One</h2><h3 id="x">No</h3><h2>No id</h2><h2 class="b" id="c">Two <i>2</i></h2>',
      ),
    ).toEqual([
      { id: 'a', title: 'One' },
      { id: 'c', title: 'Two 2' },
    ]);
  });

  it('shows only for three sections or more', () => {
    const two = [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ];
    expect(sectionNav(two)).toBe('');
    expect(sectionNav([...two, { id: 'c', title: 'C' }])).toContain(
      '<nav class="side" aria-label="On this page">',
    );
  });

  it('shows on the long generated pages and not on the 404 page', () => {
    const files = Object.fromEntries(generated);
    for (const name of ['faq.html', 'credits.html', 'privacy.html', 'seattle.html'])
      expect(files[name], name).toContain('class="side"');
    expect(files['404.html']).not.toContain('class="side"');
  });
});
