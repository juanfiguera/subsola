import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formatPct,
  formatShare,
  holderName,
  leadRows,
  materialName,
  materialShares,
  mostDugBlocks,
  nycHolders,
  pipeSystems,
  reopeningRows,
  sourceCredits,
  tidyStreet,
  yearsCovered,
} from './derive';
import { pageFigures } from './figures';
import { CITY_KEYS, insightsSchema, type CityKey } from './schema';

const source = { datasets: ['x'], filter: 'test' };
const fig = <T>(value: T) => ({ value, source });

const permits = (city: CityKey, oneYear: number, blocks: string[]) => ({
  streetOpenings: fig(1000),
  range: ['1990-07-20', '2026-10-24'],
  coveredYears: city === 'nyc' ? [1991, 2026] : [2011, 2026],
  topHolders: fig(
    city === 'nyc'
      ? [
          { holder: 'CONSOLIDATED EDISON', permits: 336, share: 33.6 },
          {
            holder: 'THE BROOKLYN UNION GAS COMPANY D/B/A NATIONAL GRID NY',
            permits: 116,
            share: 11.6,
          },
          { holder: 'KEYSPAN ENERGY DELIVERY N.Y.C.', permits: 87, share: 8.7 },
          { holder: 'Holder not shown (may be a person)', permits: 60, share: 6 },
          { holder: 'NYC DEPT OF ENVIRONMENTAL PROT', permits: 21, share: 2.1 },
          { holder: 'NYC DEPT OF ENVIRONMENTAL PROTECTION', permits: 9, share: 0.9 },
          { holder: 'MASPETH SUPPLY CO.,LLC', permits: 16, share: 1.6 },
        ]
      : [],
  ),
  reopening: {
    medianDaysBetweenVisits: fig(102),
    reopenedWithinOneYearPct: fig(oneYear),
    reopenedWithinThreeYearsPct: fig(88.3),
    otherUtilityWithin90DaysPct: fig(22.7),
    mostVisited: fig(
      blocks.map((block, index) => ({
        block: block || null,
        visits: 400 - index,
        utilities: ['electric', 'gas', 'water'],
      })),
    ),
  },
});

const pipe = (city: CityKey, miles: number, materials: Record<string, number>) => ({
  city,
  utility: 'sewer',
  miles: fig(miles),
  medianInstallYear: fig(1951),
  materialPctOfMiles: fig(materials),
});

const lead = (unit: string, total: number, galvanized: number | null) => ({
  summary: fig({
    unit,
    total,
    lead: 10,
    leadPct: 1,
    galvanized,
    galvanizedPct: galvanized === null ? null : 0,
    unknown: 140,
    unknownPct: 0,
  }),
});

const license = (name: string) => ({
  name,
  publisher: 'Publisher',
  license: 'Open',
  url: 'https://example.gov/data',
});

const fixture = () =>
  insightsSchema.parse({
    generatedAt: '2026-11-09T04:06:56.729Z',
    cellsBuiltAt: '2026-11-08T11:40:39.464Z',
    cities: Object.fromEntries(CITY_KEYS.map((city) => [city, city])),
    permits: Object.fromEntries(
      CITY_KEYS.map((city) => [
        city,
        permits(
          city,
          city === 'nyc' ? 71.9 : 82.6,
          city === 'nyc'
            ? [
                'WEST 56 STREET between 5 AVENUE and 6 AVENUE, MANHATTAN',
                '',
                'A',
                'B',
                'C',
                'D',
                'E',
                'F',
              ]
            : ['M ST NE from M ST NW/NORTH CAPITOL ST BN to 1ST ST NE', 'X', 'Y'],
        ),
      ]),
    ),
    pipes: {
      laSewers: pipe('la', 6754.3, {
        'VITRIFIED CLAY': 83.6,
        CONCRETE: 9.2,
        'NOT RECORDED': 3.3,
        PVC: 0.7,
      }),
      sdSewers: pipe('sd', 3235.3, {
        'POLYVINYL CHLORIDE': 48.6,
        'VITRIFIED CLAY': 42.5,
        'VITRIFIED CLAY EXTRA STRENGTH': 0.4,
        UNKNOWN: 1.8,
      }),
      sfSideSewers: pipe('sf', 1020, { 'VITRIFIED CLAY': 99 }),
    },
    leadServiceLines: {
      nyc: lead('tax lots', 856912, 3050),
      dc: lead('premises', 127835, null),
      sd: lead('water meters', 281006, 5),
      sea: lead('water services', 0, 0),
    },
    models: {
      licenses: Object.fromEntries(
        CITY_KEYS.map((city) => [
          city,
          {
            [`${city}Permits`]: license('Street permits'),
            [`${city}Other`]: license('Street permits'),
            [`${city}StormDrains`]: license('Storm drains'),
          },
        ]),
      ),
    },
  });

describe('tidyStreet', () => {
  it('reads the street files written in capitals', () => {
    expect(tidyStreet('WEST 56 STREET between 5 AVENUE and 6 AVENUE, MANHATTAN')).toBe(
      'West 56 Street between 5 Avenue and 6 Avenue, Manhattan',
    );
    expect(tidyStreet('M ST NE from M ST NW/NORTH CAPITOL ST BN to 1ST ST NE')).toBe(
      'M St NE from M St NW/North Capitol St Bn to 1st St NE',
    );
    expect(tidyStreet('MISSION ST between 07TH ST and JULIA ST')).toBe(
      'Mission St between 7th St and Julia St',
    );
    expect(tidyStreet('1ST AVE S BETWEEN S KING ST AND S DEARBORN ST')).toBe(
      '1st Ave S between S King St and S Dearborn St',
    );
  });
});

describe('holders', () => {
  it('names companies the way people know them', () => {
    expect(holderName('CONSOLIDATED EDISON')).toBe('Con Edison');
    expect(holderName('KEYSPAN ENERGY DELIVERY N.Y.C.')).toBe('National Grid');
    expect(holderName('MASPETH SUPPLY CO.,LLC')).toBe('Maspeth Supply');
    expect(holderName('JOSEPH L. BALKAN, INC.')).toBe('Joseph L. Balkan, Inc.');
    expect(holderName('C.A.C. INDUSTRIES INC.')).toBe('C.A.C. Industries');
    expect(holderName('JRCRUZ CORP.')).toBe('Jrcruz Corp.');
  });

  it("combines National Grid's KeySpan filings and drops the grouped names", () => {
    const holders = nycHolders(fixture());
    expect(holders.map((holder) => holder.holder)).toEqual([
      'Con Edison',
      'National Grid',
      'NYC Environmental Protection',
      'Maspeth Supply',
    ]);
    expect(holders[1]).toEqual({ holder: 'National Grid', permits: 203, pct: 20.3 });
  });
});

describe('digs', () => {
  it('compares only the cities that file permits per block', () => {
    expect(reopeningRows(fixture()).map((row) => row.city)).toEqual([
      'nyc',
      'dc',
      'sf',
      'sea',
      'den',
      'chi',
    ]);
  });

  it('reads a file from before Chicago joined, and leaves Chicago out', () => {
    const withoutChicago = <T extends object>(byCity: T) =>
      Object.fromEntries(Object.entries(byCity).filter(([city]) => city !== 'chi'));
    const current = fixture();
    const older = insightsSchema.parse({
      ...current,
      permits: withoutChicago(current.permits),
      cities: withoutChicago(current.cities),
      models: { licenses: withoutChicago(current.models.licenses) },
    });
    expect(reopeningRows(older).map((row) => row.city)).not.toContain('chi');
    expect(sourceCredits(older).map((credit) => credit.city)).not.toContain('chi');
    expect(mostDugBlocks(older).map((block) => block.city)).not.toContain('chi');
  });

  it('reads a file from before Denver joined, and leaves Denver out', () => {
    const withoutDenver = <T extends object>(byCity: T) =>
      Object.fromEntries(Object.entries(byCity).filter(([city]) => city !== 'den'));
    const current = fixture();
    const older = insightsSchema.parse({
      ...current,
      permits: withoutDenver(current.permits),
      cities: withoutDenver(current.cities),
      models: { licenses: withoutDenver(current.models.licenses) },
    });
    expect(reopeningRows(older).map((row) => row.city)).not.toContain('den');
    expect(sourceCredits(older).map((credit) => credit.city)).not.toContain('den');
    expect(pageFigures(older)['den-total']).toBe('n/a');
  });

  it('lists six New York blocks and two elsewhere, skipping ones with no name', () => {
    const blocks = mostDugBlocks(fixture());
    expect(blocks.filter((block) => block.city === 'nyc')).toHaveLength(6);
    expect(blocks.filter((block) => block.city === 'la')).toHaveLength(0);
    expect(blocks[0]).toMatchObject({
      block: 'West 56 Street between 5 Avenue and 6 Avenue, Manhattan',
      digs: 400,
      utilities: 3,
    });
    expect(blocks[1]!.block).toBe('A');
  });

  it('starts the years covered at the first busy year', () => {
    expect(yearsCovered(fixture(), 'nyc')).toEqual([1991, 2026]);
  });
});

describe('pipes', () => {
  it('merges spellings and keeps the three largest materials', () => {
    expect(materialName('POLYVINYLCHLORIDE')).toBe('PVC');
    expect(materialName('ASBESTOS CEMENT')).toBe('Asbestos cement');
    expect(
      materialShares({
        'VITRIFIED CLAY': 42.5,
        'VITRIFIED CLAY EXTRA STRENGTH': 0.4,
        PVC: 48.6,
        UNKNOWN: 1.8,
        BRICK: 1,
      }),
    ).toEqual([
      { material: 'PVC', pct: 48.6 },
      { material: 'Vitrified clay', pct: 42.9 },
      { material: 'Not recorded', pct: 1.8 },
      { material: 'Everything else', pct: 6.7 },
    ]);
  });

  it('shows only the systems the page compares, longest first', () => {
    expect(pipeSystems(fixture()).map((system) => system.key)).toEqual(['laSewers', 'sdSewers']);
  });
});

describe('lead service lines', () => {
  it('leaves out a city whose inventory did not download', () => {
    expect(leadRows(fixture()).map((row) => row.city)).toEqual(['nyc', 'dc', 'sd']);
  });

  it('never rounds a real handful down to nothing', () => {
    expect(formatShare(0, 140)).toBe('under 0.1% (140)');
    expect(formatShare(0, 0)).toBe('0% (0)');
    expect(formatShare(null, null)).toBe('not listed');
    expect(formatPct(13.0)).toBe('13%');
  });
});

describe('sources', () => {
  it('credits the charted datasets once per publisher and license', () => {
    const nyc = sourceCredits(fixture()).find((credit) => credit.city === 'nyc')!;
    expect(nyc.entries).toEqual([
      {
        name: 'Street permits',
        publisher: 'Publisher',
        license: 'Open',
        url: 'https://example.gov/data',
      },
    ]);
  });
});

describe('pageFigures', () => {
  it('has a figure for every slot insights.html names', () => {
    const html = readFileSync(new URL('../../insights.html', import.meta.url), 'utf8');
    const slots = [...html.matchAll(/data-fig="([^"]+)"/g)].map((match) => match[1]!);
    const figures = pageFigures(fixture());
    expect(slots.length).toBeGreaterThan(20);
    for (const slot of slots) expect(figures, slot).toHaveProperty(slot);
  });

  it('fills the headline and says n/a for what the file lacks', () => {
    const figures = pageFigures(fixture());
    expect(figures['nyc-1yr']).toBe('71.9%');
    expect(figures['dc-1yr']).toBe('82.6%');
    expect(figures['national-grid-pct']).toBe('20.3%');
    expect(figures['la-sewer-top']).toBe('vitrified clay');
    expect(figures['sd-water-top']).toBe('n/a');
    expect(figures['sea-total']).toBe('n/a');
    expect(figures['built-date']).toBe('November 8, 2026');
  });
});
