import { describe, expect, it } from 'vitest';
import {
  CHICAGO_DISCLAIMER,
  CITY_CREDITS,
  creditLine,
  linkCredit,
  OSM_CREDIT,
} from './attribution';
import { REGIONS } from './regions';
import { creditsPage } from './pages/credits';
import { escapeHtml } from './ui/dom';

describe('city credits', () => {
  it('use the wording each publisher asks for', () => {
    expect(CITY_CREDITS.dc.text).toContain('Source: Open Data DC (opendata.dc.gov)');
    expect(CITY_CREDITS.dc.text).toContain('CC BY 4.0');
    expect(CITY_CREDITS.dc.text).toContain('modified by Subsola');
    expect(CITY_CREDITS.den.text).toContain('City of Denver Open Data Catalog');
    expect(CITY_CREDITS.den.text).toContain('CC BY 3.0');
    expect(CITY_CREDITS.sd.text).toContain(
      'GIS data derived, modified, reduced, and/or processed from SanGIS downloadable data - www.sangis.org',
    );
    expect(CITY_CREDITS.chi.text).toContain(CHICAGO_DISCLAIMER);
    expect(CHICAGO_DISCLAIMER).toMatch(
      /^This site provides applications using data that has been modified/,
    );
    expect(CHICAGO_DISCLAIMER).toMatch(/being used at one's own risk\.$/);
  });

  it('cover every city, each with the OpenStreetMap credit in its one line', () => {
    for (const region of REGIONS) {
      expect(CITY_CREDITS[region.id].text.length).toBeGreaterThan(40);
      expect(creditLine(region.id)).toContain('© OpenStreetMap contributors');
    }
  });

  it('turn the named sources into links', () => {
    const html = linkCredit(CITY_CREDITS.den, escapeHtml);
    expect(html).toContain('<a href="http://data.denvergov.org"');
    expect(html).toContain('>CC BY 3.0</a>');
    expect(linkCredit(OSM_CREDIT, escapeHtml)).toContain(
      '<a href="https://www.openstreetmap.org/copyright"',
    );
  });
});

describe('credits page', () => {
  const html = creditsPage('assets/pages.css');

  it("gives every city's credit, Chicago's disclaimer and what is paused", () => {
    for (const region of REGIONS) expect(html).toContain(`id="credits-${region.id}"`);
    // Word for word, with the city's address as a link.
    const [before, after] = escapeHtml(CHICAGO_DISCLAIMER).split('www.cityofchicago.org');
    expect(html).toContain(before);
    expect(html).toContain(after);
    expect(html).toContain('Paused while we ask');
    expect(html).toContain('Denver Water');
    expect(html).toContain('not affiliated with or endorsed by');
    expect(html).not.toContain(String.fromCharCode(0x2014));
  });
});
