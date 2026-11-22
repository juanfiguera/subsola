import { describe, expect, it } from 'vitest';
import { DEN, NYC, REGIONS, SEA, citySlug } from '../regions';
import { CITY_FACTS, readFigures } from './cities';
import { cityPage, cityPath } from './cityPage';
import { jsonLdScript } from './layout';
import { notFoundPage, robotsTxt, sitemapPaths, sitemapXml } from './siteFiles';
import { pageFiles } from './build';
import { faqPage } from './faq';

const CSS = 'assets/pages-abc123.css';

describe('city slugs', () => {
  it('reads as the city name', () => {
    expect(REGIONS.map(citySlug)).toEqual([
      'new-york-city',
      'washington-dc',
      'san-francisco',
      'los-angeles',
      'san-diego',
      'seattle',
      'denver',
      'chicago',
      'dallas',
    ]);
  });

  it("doesn't collide with the site's other paths", () => {
    const taken = [
      '/',
      '/insights',
      '/mcp',
      '/privacy',
      '/credits',
      '/faq',
      '/api',
      '/og',
      '/fonts',
      '/models',
    ];
    for (const region of REGIONS) expect(taken).not.toContain(cityPath(region));
  });
});

describe('city facts', () => {
  it('covers every region', () => {
    for (const region of REGIONS) expect(CITY_FACTS[region.id], region.id).toBeDefined();
  });
});

describe('city page', () => {
  it('names the city in the title, heading, canonical link and map link', () => {
    const html = cityPage(SEA, undefined, CSS);
    expect(html).toContain('<title>Seattle underground utility map | Subsola</title>');
    expect(html).toContain('<h1>Seattle underground utility map</h1>');
    expect(html).toContain('<link rel="canonical" href="https://subsola.com/seattle" />');
    expect(html).toContain('<meta property="og:url" content="https://subsola.com/seattle" />');
    expect(html).toContain('href="/?q=1420%205th%20Ave%2C%20Seattle"');
    expect(html).toContain(`href="/${CSS}"`);
    expect(html).toContain('https://washington811.com/');
  });

  it('links every other city, and no city to itself', () => {
    const html = cityPage(SEA, undefined, CSS);
    for (const region of REGIONS.filter((other) => other !== SEA))
      expect(html).toContain(`href="${cityPath(region)}"`);
    expect(html).not.toContain('href="/seattle"');
  });

  it('marks beta cities from the region, with the reason', () => {
    expect(cityPage(DEN, undefined, CSS)).toContain('<strong>Beta.</strong>');
    expect(cityPage(SEA, undefined, CSS)).not.toContain('<strong>Beta.</strong>');
    // Denver shows as beta in every other city's list.
    expect(cityPage(SEA, undefined, CSS)).toContain('Denver <span class="tag">Beta</span></a>');
  });

  it('quotes the figures when there are some, and leaves them out when not', () => {
    const figures = {
      permitsSince: 1991,
      miles: {},
      lead: { unit: 'tax lots', total: 856912, lead: 117561 },
      asOf: '2026-11-08',
    };
    const html = cityPage(NYC, figures, CSS);
    expect(html).toContain('from <b>1991</b> on');
    expect(html).toContain('<b>117,561</b> are listed as lead');
    expect(html).toContain('as of 2026-11-08');
    const bare = cityPage(NYC, undefined, CSS);
    expect(bare).not.toContain('<b>');
    expect(bare).not.toContain('as of');
  });

  it('escapes what it prints', () => {
    const html = cityPage({ ...SEA, name: '<img src=x onerror=alert(1)>' }, undefined, CSS);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('carries structured data that a script element can hold', () => {
    const html = cityPage(SEA, undefined, CSS);
    const json = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)?.[1];
    expect(JSON.parse(json!)).toMatchObject({
      '@type': 'WebPage',
      about: { '@type': 'City', name: 'Seattle' },
    });
    expect(jsonLdScript({ name: '</script><script>alert(1)</script>' })).not.toContain(
      '</script><script>',
    );
  });
});

describe('figures from insights.json', () => {
  it('reads what it can, city by city', () => {
    const figures = readFigures({
      cellsBuiltAt: '2026-11-08T11:40:39.464Z',
      permits: { sea: { coveredYears: [2013, 2014] }, nyc: { coveredYears: [] } },
      pipes: {
        seaWaterMains: { city: 'sea', utility: 'water', miles: { value: 1282 } },
        sfSewerMains: { city: 'sf', utility: 'sewer', miles: { value: 1193 } },
        sfSideSewers: { city: 'sf', utility: 'sewer', miles: { value: 1020 } },
      },
      leadServiceLines: {
        nyc: { summary: { value: { unit: 'tax lots', total: 10, lead: 2 } } },
        sd: { summary: { value: { unit: 'water meters', total: 0, lead: 0 } } },
      },
    });
    expect(figures.sea).toEqual({
      permitsSince: 2013,
      miles: { water: 1282 },
      lead: null,
      asOf: '2026-11-08',
    });
    expect(figures.sf?.miles).toEqual({ sewer: 2213 });
    expect(figures.nyc?.permitsSince).toBeNull();
    expect(figures.nyc?.lead).toEqual({ unit: 'tax lots', total: 10, lead: 2 });
    // A city whose inventory didn't download has no lead figure.
    expect(figures.sd?.lead).toBeNull();
  });

  it('gives up quietly on a file it does not recognize', () => {
    expect(readFigures(null)).toEqual({});
    expect(readFigures({ hello: 'world' })).toEqual({});
  });
});

describe('site files', () => {
  it('lists the home page, the other pages and every city in the sitemap', () => {
    expect(sitemapPaths()).toEqual([
      '/',
      '/insights',
      '/mcp',
      '/privacy',
      '/credits',
      '/faq',
      ...REGIONS.map((region) => `/${citySlug(region)}`),
    ]);
    const xml = sitemapXml(['/', '/a&b']);
    expect(xml).toContain('<loc>https://subsola.com/</loc>');
    expect(xml).toContain('<loc>https://subsola.com/a&amp;b</loc>');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it('points robots at the sitemap', () => {
    expect(robotsTxt()).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://subsola.com/sitemap.xml\n',
    );
  });

  it('keeps the 404 page out of search results and points home', () => {
    const html = notFoundPage(CSS);
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).not.toContain('rel="canonical"');
    expect(html).toContain('<a class="cta" href="/">Open the map</a>');
  });

  it('writes one page per city and the root files', () => {
    expect(Object.keys(pageFiles(CSS, {})).sort()).toEqual(
      [
        ...REGIONS.map((region) => `${citySlug(region)}.html`),
        '404.html',
        'privacy.html',
        'credits.html',
        'faq.html',
        'robots.txt',
        'sitemap.xml',
      ].sort(),
    );
  });
});

describe('FAQ page', () => {
  const html = faqPage(CSS);

  it('says plainly that Subsola is not a utility locate and points to 811', () => {
    expect(html).toContain('research, not a utility locate');
    expect(html).toContain('Call 811');
  });

  it('carries every question in FAQPage structured data, as plain text', () => {
    const json = JSON.parse(
      html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]!,
    ) as { '@type': string; mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(json['@type']).toBe('FAQPage');
    const headings = [...html.matchAll(/<h3 id="[^"]+" class="faq-q">(.*?)<\/h3>/g)].map(
      (m) => m[1],
    );
    expect(json.mainEntity.map((q) => q.name)).toEqual(headings);
    for (const q of json.mainEntity) expect(q.acceptedAnswer.text).not.toMatch(/[<>]/);
  });

  it('lists every covered city', () => {
    for (const region of REGIONS) expect(html).toContain(region.name);
  });
});
