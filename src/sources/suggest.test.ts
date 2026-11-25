import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHI, DAL, DC, LA, NYC, SEA, SJ, SF, type Region } from '../regions';
import {
  citiesToAsk,
  mergeSuggestions,
  streetPart,
  suggestAddresses,
  type CitySuggestion,
} from './suggest';
import type { AddressIndex } from './addressIndex';

const ids = (regions: Region[]) => regions.map((region) => region.id);

const rows = (region: Region, count: number): CitySuggestion[] =>
  Array.from({ length: count }, (_, i) => ({
    line: `${i + 1} TEST ST`,
    place: region.name,
    query: `${i + 1} TEST ST`,
    region,
  }));

describe('citiesToAsk', () => {
  it('asks the city on the map and New York', () => {
    expect(ids(citiesToAsk('1500 Mar', DAL))).toEqual(['dal', 'nyc']);
    expect(ids(citiesToAsk('233 broad', NYC))).toEqual(['nyc']);
    expect(ids(citiesToAsk('233 broad', null))).toEqual(['nyc']);
  });

  it('asks only the city named after a comma', () => {
    expect(ids(citiesToAsk('1500 Marilla, Dallas', NYC))).toEqual(['dal']);
    expect(ids(citiesToAsk('600 4th Ave, 98104', LA))).toEqual(['sea']);
    expect(ids(citiesToAsk('233 Broadway, Manhattan', SF))).toEqual(['nyc']);
    expect(ids(citiesToAsk('800 F St, Washington DC', CHI))).toEqual(['dc']);
  });

  it('adds a city named without a comma in New York’s place, keeping the city on the map', () => {
    // The quadrant points at DC, but the city on the map stays in case it's a street.
    expect(ids(citiesToAsk('800 F St NW', NYC))).toEqual(['nyc', 'dc']);
    expect(ids(citiesToAsk('800 F St NW', SEA))).toEqual(['sea', 'dc']);
    expect(ids(citiesToAsk('233 Washington St', SF))).toEqual(['sf', 'dc']);
  });

  it("doesn't read a house number as a ZIP", () => {
    expect(ids(citiesToAsk('20012 Ventura', LA))).toEqual(['la', 'nyc']);
    expect(ids(citiesToAsk('94102 Mission', NYC))).toEqual(['nyc']);
  });

  it('keeps San Francisco’s San Jose Avenue in San Francisco', () => {
    expect(ids(citiesToAsk('100 San Jose Ave', SF))).toEqual(['sf', 'nyc']);
    expect(ids(citiesToAsk('200 E Santa Clara, San Jose', NYC))).toEqual(['sj']);
  });
});

describe('streetPart', () => {
  it('sends only the street to the lookup once the city after the comma has chosen it', () => {
    expect(streetPart('200 N Spr, Los Angeles')).toBe('200 N Spr');
    expect(streetPart('800 F St NW, DC 20004')).toBe('800 F St NW');
    expect(streetPart('233 broad')).toBe('233 broad');
  });
});

describe('mergeSuggestions', () => {
  it('gives each city its share before filling the rest', () => {
    const merged = mergeSuggestions([rows(DAL, 6), rows(NYC, 6)], 6);
    expect(merged.map((row) => row.region.id)).toEqual(['dal', 'dal', 'dal', 'nyc', 'nyc', 'nyc']);
  });

  it('lets a city with more take what another left', () => {
    const merged = mergeSuggestions([rows(DAL, 6), rows(NYC, 1)], 6);
    expect(merged.map((row) => row.region.id)).toEqual(['dal', 'dal', 'dal', 'dal', 'dal', 'nyc']);
    expect(mergeSuggestions([rows(DC, 2)], 6)).toHaveLength(2);
    expect(mergeSuggestions([], 6)).toEqual([]);
  });
});

describe('suggestAddresses', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks the chosen cities in parallel and labels each row with its city', async () => {
    const dal = vi
      .spyOn(DAL, 'suggest')
      .mockResolvedValue([{ line: '1500 MARILLA ST', place: 'Dallas', query: '1500 MARILLA ST' }]);
    const nyc = vi
      .spyOn(NYC, 'suggest')
      .mockResolvedValue([
        { line: '1500 MARKET ST', place: 'Brooklyn', query: '1500 MARKET ST, Brooklyn' },
      ]);
    const other = vi.spyOn(SJ, 'suggest');
    const found = await suggestAddresses('1500 Mar', DAL);
    expect(found.map((row) => [row.line, row.region.id])).toEqual([
      ['1500 MARILLA ST', 'dal'],
      ['1500 MARKET ST', 'nyc'],
    ]);
    expect(dal).toHaveBeenCalledWith('1500 Mar', 6, undefined);
    expect(nyc).toHaveBeenCalledOnce();
    expect(other).not.toHaveBeenCalled();
  });

  it('quietly drops a city that fails, logging nothing of what was typed', async () => {
    vi.spyOn(SF, 'suggest').mockRejectedValue(new Error('No match for "1 Secret Ln"'));
    vi.spyOn(NYC, 'suggest').mockResolvedValue([
      { line: '1 SECRET LN', place: 'Queens', query: '1 SECRET LN, Queens' },
    ]);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const found = await suggestAddresses('1 Secret Ln', SF);
    expect(found.map((row) => row.region.id)).toEqual(['nyc']);
    expect(info).toHaveBeenCalledOnce();
    expect(String(info.mock.calls[0]![0])).not.toMatch(/secret/i);
  });
});

describe('suggestAddresses with the index', () => {
  afterEach(() => vi.restoreAllMocks());

  const indexFor = (
    rows: Record<string, { line: string; place: string }[] | null>,
  ): AddressIndex => ({
    lookup: vi.fn(async (city: string) => rows[city] ?? null),
  });

  it('answers a street address from the index, asking no city lookup', async () => {
    const dal = vi.spyOn(DAL, 'suggest');
    const nyc = vi.spyOn(NYC, 'suggest');
    const index = indexFor({
      dal: [{ line: '1500 MARILLA ST', place: 'Dallas' }],
      nyc: [{ line: '1500 MARKET ST', place: 'Brooklyn' }],
    });
    const found = await suggestAddresses('1500 Mar', DAL, undefined, 6, index);
    expect(found.map((row) => [row.line, row.query, row.region.id])).toEqual([
      ['1500 MARILLA ST', '1500 MARILLA ST', 'dal'],
      ['1500 MARKET ST', '1500 MARKET ST, Brooklyn', 'nyc'],
    ]);
    expect(dal).not.toHaveBeenCalled();
    expect(nyc).not.toHaveBeenCalled();
  });

  it("asks the city's own lookup for a city the index doesn't cover", async () => {
    const dc = vi
      .spyOn(DC, 'suggest')
      .mockResolvedValue([{ line: '800 F ST NW', place: 'Washington, DC', query: '800 F St NW' }]);
    const index = indexFor({ nyc: [] });
    const found = await suggestAddresses('800 F St NW', DC, undefined, 6, index);
    expect(found.map((row) => row.region.id)).toEqual(['dc']);
    expect(dc).toHaveBeenCalledOnce();
  });

  it('sends a landmark to the city lookup, since the index holds only street addresses', async () => {
    const nyc = vi
      .spyOn(NYC, 'suggest')
      .mockResolvedValue([{ line: 'TIMES SQUARE', place: 'Manhattan', query: 'Times Square' }]);
    const index = indexFor({ nyc: [] });
    await suggestAddresses('Times Squ', NYC, undefined, 6, index);
    expect(index.lookup).not.toHaveBeenCalled();
    expect(nyc).toHaveBeenCalledOnce();
  });
});

describe('suggestAddresses across cities with the index', () => {
  afterEach(() => vi.restoreAllMocks());

  it('finds a street address in any indexed city, the city on the map first', async () => {
    const chi = vi.spyOn(CHI, 'suggest');
    const index: AddressIndex = {
      lookup: vi.fn(async (city: string) =>
        city === 'chi'
          ? [{ line: '233 S WACKER DR', place: 'Chicago' }]
          : city === 'nyc'
            ? []
            : null,
      ),
    };
    vi.spyOn(SF, 'suggest').mockResolvedValue([]);
    const found = await suggestAddresses('233 S Wack', SF, undefined, 6, index);
    expect(found.map((row) => [row.line, row.region.id])).toEqual([['233 S WACKER DR', 'chi']]);
    expect(chi).not.toHaveBeenCalled();
    // Cities with no index are reached only through their own lookup, and only the chosen two.
    expect(vi.mocked(index.lookup).mock.calls.length).toBeGreaterThan(2);
  });

  it('keeps to the city named after a comma', async () => {
    const index: AddressIndex = { lookup: vi.fn(async () => []) };
    await suggestAddresses('233 S Wack, Chicago', SF, undefined, 6, index);
    expect(vi.mocked(index.lookup).mock.calls.map(([city]) => city)).toEqual(['chi']);
  });
});
