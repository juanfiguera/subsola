import { describe, expect, it } from 'vitest';
import { COVERAGE, PERMITS_SINCE, permitsSince } from './coverage';
import { docsPage } from './page';
import { REGIONS } from '../../src/regions';
import { SOURCES } from '../../src/sources/catalog';

describe('coverage', () => {
  it('has a permit start date for every city it covers', () => {
    for (const region of REGIONS)
      if (COVERAGE[region.id])
        expect(PERMITS_SINCE[region.id], region.id).toMatch(/^\d{4}-\d\d-\d\d$/);
  });

  it("matches the built data's permit ranges (insights.json, 2026-11-11)", () => {
    expect(PERMITS_SINCE).toMatchObject({
      nyc: '1990-07-20',
      dc: '2005-10-25',
      sf: '1995-12-05',
      la: '2000-02-18',
      sd: '2003-08-21',
      sea: '1999-01-01',
    });
    expect(permitsSince('nyc')).toBe('Since 1990');
  });

  it('names only datasets the catalog has', () => {
    for (const coverage of Object.values(COVERAGE)) {
      for (const key of coverage!.permits) expect(SOURCES[key]).toBeDefined();
      for (const pipe of coverage!.pipes) expect(SOURCES[pipe.source]).toBeDefined();
    }
  });

  it('reads right in the matrix, Dallas included', () => {
    const html = docsPage('nonce');
    const dallas = /<tr><th scope="row">Dallas<\/th>(.*?)<\/tr>/.exec(html)?.[1] ?? '';
    expect(dallas).toContain('Since 2021');
    expect(dallas).toContain('None published');
    expect(dallas).toContain('Texas811');
  });

  it('reads right in the matrix, Chicago included', () => {
    const html = docsPage('nonce');
    const row = (name: string) =>
      new RegExp(`<tr><th scope="row">${name}</th>(.*?)</tr>`).exec(html)?.[1] ?? '';
    expect(row('New York City')).toContain('Since 1990');
    const chicago = row('Chicago');
    expect(chicago).toContain('Since 1991');
    expect(chicago).toContain('None published');
    expect(chicago).toContain('Not published');
    expect(chicago).toContain('Chicago 811 (DIGGER)');
  });
});
