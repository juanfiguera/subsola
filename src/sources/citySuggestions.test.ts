import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseNycSuggestions, suggestNyc } from './geocode';
import { geocodeDc, parseDcSuggestions, suggestDc } from './dcGeocode';
import { geocodeLa, parseLaSuggestions, suggestLa } from './laGeocode';
import { geocodeSea, parseSeaSuggestions } from './seaGeocode';
import { geocodeSf, parseSfSuggestions } from './sfGeocode';
import { parseSdSuggestions, suggestSd } from './sdGeocode';
import { parseDalSuggestions, suggestDal } from './dalGeocode';
import { parseDenSuggestions, suggestDen } from './denGeocode';
import { parseSjSuggestions, suggestSj } from './sjGeocode';
import { chiPrefixWhere, parseChiSuggestions, suggestChi } from './chiGeocode';

// Made-up rows in the shape each server answers with.
const respond = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const mockFetch = (body: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(respond(body)));
const askedUrl = (spy: ReturnType<typeof mockFetch>) => new URL(String(spy.mock.calls[0]![0]));

afterEach(() => vi.restoreAllMocks());

describe('New York', () => {
  const feature = (name: string, borough: string, at: [number, number]) => ({
    geometry: { coordinates: at },
    properties: { name, housenumber: name.split(' ')[0], borough, label: `${name}, New York` },
  });

  it('shows each spot once, under its first name, and asks again with the borough', () => {
    expect(
      parseNycSuggestions({
        features: [
          feature('233 BROADWAY', 'Manhattan', [-74.0081, 40.7125]),
          feature("233 B'WAY", 'Manhattan', [-74.0081, 40.7125]),
          feature('233 BROAD STREET', 'Staten Island', [-74.0826, 40.6239]),
          { geometry: { coordinates: [-74, 40.7] }, properties: { name: 'Broadway' } },
        ],
      }),
    ).toEqual([
      { line: '233 BROADWAY', place: 'Manhattan', query: '233 BROADWAY, Manhattan' },
      {
        line: '233 BROAD STREET',
        place: 'Staten Island',
        query: '233 BROAD STREET, Staten Island',
      },
    ]);
  });

  it('asks GeoSearch autocomplete for the typed text', async () => {
    const spy = mockFetch({ features: [] });
    await suggestNyc('233 broad', 6);
    const url = askedUrl(spy);
    expect(url.pathname).toBe('/v2/autocomplete');
    expect(url.searchParams.get('text')).toBe('233 broad');
  });
});

describe('Washington, DC', () => {
  it('keeps the locator’s key with each row', () => {
    expect(parseDcSuggestions([{ text: '800 F STREET NW', magicKey: 'k1' }])).toEqual([
      {
        line: '800 F STREET NW',
        place: 'Washington, DC',
        query: '800 F STREET NW',
        magicKey: 'k1',
      },
    ]);
  });

  it('asks Suggest without the city, and hands the key back when finding the pick', async () => {
    const spy = mockFetch({ suggestions: [] });
    await suggestDc('800 F St, Washington DC', 6);
    expect(askedUrl(spy).pathname).toMatch(/\/suggest$/);
    expect(askedUrl(spy).searchParams.get('text')).toBe('800 F St');
    spy.mockResolvedValue(
      respond({
        candidates: [{ address: '800 F STREET NW', score: 100, location: { x: -77.02, y: 38.9 } }],
      }),
    );
    await geocodeDc('800 F STREET NW', undefined, 'k1');
    expect(new URL(String(spy.mock.calls[1]![0])).searchParams.get('magicKey')).toBe('k1');
  });
});

describe('Los Angeles and Seattle', () => {
  it('keeps only the city’s own rows, each address once', () => {
    expect(
      parseLaSuggestions([
        { text: '200 North Spring Street, Los Angeles, 90012', magicKey: 'a' },
        { text: '200 N Spring St, Los Angeles, 90012', magicKey: 'b' },
        { text: '200 Spring St, Claremont, 91711', magicKey: 'c' },
        { text: '14000 Ventura Boulevard, Sherman Oaks, 91423', magicKey: 'd' },
        { text: 'Spring Street Park, Los Angeles', magicKey: 'e' },
      ]),
    ).toEqual([
      {
        line: '200 North Spring Street',
        place: 'Los Angeles',
        query: '200 North Spring Street, Los Angeles, 90012',
        magicKey: 'a',
      },
    ]);
    expect(
      parseSeaSuggestions([
        { text: '600 4TH AVE, Seattle, WA, 98104', magicKey: 's' },
        { text: '600 4TH ST, Kirkland, WA, 98033', magicKey: 'k' },
      ]),
    ).toEqual([
      {
        line: '600 4TH AVE',
        place: 'Seattle',
        query: '600 4TH AVE, Seattle, WA, 98104',
        magicKey: 's',
      },
    ]);
  });

  it('keeps the county locator to the city’s box and passes the key back', async () => {
    const spy = mockFetch({ suggestions: [] });
    await suggestLa('200 N Spr', 6, [-118.67, 33.7, -118.15, 34.34]);
    expect(JSON.parse(askedUrl(spy).searchParams.get('searchExtent')!)).toMatchObject({
      xmin: -118.67,
      ymax: 34.34,
    });
    const candidates = {
      candidates: [
        {
          score: 100,
          location: { x: -118.24, y: 34.05 },
          attributes: { City: 'Los Angeles', Addr_type: 'PointAddress', StAddr: '200 N Spring St' },
        },
      ],
    };
    spy.mockResolvedValue(respond(candidates));
    await geocodeLa('200 N Spring St, Los Angeles, 90012', undefined, 'la-key');
    expect(new URL(String(spy.mock.calls[1]![0])).searchParams.get('magicKey')).toBe('la-key');
    spy.mockResolvedValue(
      respond({
        candidates: [
          {
            score: 100,
            location: { x: -122.33, y: 47.6 },
            attributes: { City: 'Seattle', StAddr: '600 4TH AVE' },
          },
        ],
      }),
    );
    await geocodeSea('600 4TH AVE, Seattle, WA, 98104', undefined, 'sea-key');
    expect(new URL(String(spy.mock.calls[2]![0])).searchParams.get('magicKey')).toBe('sea-key');
  });
});

describe('San Francisco', () => {
  it('keeps addresses, not places without a number', () => {
    expect(
      parseSfSuggestions([
        { text: '1 DR CARLTON B GOODLETT PL, San Francisco, California, 94102', magicKey: 'm' },
        { text: 'GOLDEN GATE PARK, San Francisco, California', magicKey: 'p' },
      ]),
    ).toEqual([
      {
        line: '1 DR CARLTON B GOODLETT PL',
        place: 'San Francisco',
        query: '1 DR CARLTON B GOODLETT PL, San Francisco, California, 94102',
        magicKey: 'm',
      },
    ]);
  });

  it('gives the key only to the address locator it came from', async () => {
    const spy = mockFetch({ candidates: [] });
    await expect(geocodeSf('1 Nowhere Pl, San Francisco', undefined, 'sf-key')).rejects.toThrow();
    const [addresses, streets] = spy.mock.calls.map(([url]) => new URL(String(url)));
    expect(addresses!.pathname).toContain('eas_addresses');
    expect(addresses!.searchParams.get('magicKey')).toBe('sf-key');
    expect(streets!.pathname).toContain('stclines');
    expect(streets!.searchParams.has('magicKey')).toBe(false);
  });
});

describe('San Diego', () => {
  it('keeps the city’s rows and asks the city locator again by number, street and ZIP', () => {
    expect(
      parseSdSuggestions([
        { text: '202 C ST, CV, 91910', magicKey: 'x' },
        { text: '202 C ST, SD, 92101', magicKey: 'y' },
        { text: 'PARK BL, SD, 92101', magicKey: 'z' },
      ]),
    ).toEqual([{ line: '202 C ST', place: 'San Diego', query: '202 C ST, 92101' }]);
  });

  it('asks the utilities locator on the city server', async () => {
    const spy = mockFetch({ suggestions: [] });
    await suggestSd('202 C St, San Diego', 6);
    expect(askedUrl(spy).hostname).toBe('webmaps.sandiego.gov');
    expect(askedUrl(spy).pathname).toContain('PUD_Locator_Suggest');
    expect(askedUrl(spy).searchParams.get('text')).toBe('202 C St');
  });
});

describe('Dallas, Denver and San Jose address points', () => {
  it('reads Dallas rows as the line geocodeDal reads back', () => {
    expect(
      parseDalSuggestions({
        features: [
          {
            attributes: {
              HOUSENUMBER: 1500,
              STREETPREDIRECTION: null,
              NAME: 'MARILLA',
              STREETTYPE: 'ST',
              STREETPOSTDIRECTION: null,
            },
          },
          { attributes: { HOUSENUMBER: null, NAME: 'MARKET CENTER', STREETTYPE: 'BLVD' } },
        ],
      }),
    ).toEqual([{ line: '1500 MARILLA ST', place: 'Dallas', query: '1500 MARILLA ST' }]);
  });

  it('reads Denver rows the way people say them, without the north nobody says', () => {
    expect(
      parseDenSuggestions({
        features: [
          {
            attributes: {
              ADDRESS_NUMBER: 1437,
              PREDIRECTIONAL: 'N',
              STREET_NAME: 'Bannock',
              POSTTYPE: 'St',
            },
          },
          {
            attributes: {
              ADDRESS_NUMBER: 1600,
              PREDIRECTIONAL: 'S',
              STREET_NAME: 'Broadway',
              POSTTYPE: null,
            },
          },
        ],
      }),
    ).toEqual([
      { line: '1437 Bannock St', place: 'Denver', query: '1437 Bannock St' },
      { line: '1600 S Broadway', place: 'Denver', query: '1600 S Broadway' },
    ]);
  });

  it('reads San Jose rows with the direction and type', () => {
    expect(
      parseSjSuggestions({
        features: [
          {
            attributes: {
              Add_Number: 200,
              St_PreDirAbbr: 'E',
              St_PreTyp: null,
              StreetName: 'Santa Clara',
              St_PosTypUSPS: 'St',
              St_PosDir: null,
            },
          },
        ],
      }),
    ).toEqual([{ line: '200 E SANTA CLARA ST', place: 'San Jose', query: '200 E SANTA CLARA ST' }]);
  });

  it('asks only for address fields, one row per address, and nothing for a bare number', async () => {
    const spy = mockFetch({ features: [] });
    expect(await suggestDal('1500', 6)).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    for (const suggest of [suggestDal, suggestDen, suggestSj]) await suggest("1500 Mar'", 6);
    for (const [url] of spy.mock.calls) {
      const params = new URL(String(url)).searchParams;
      expect(params.get('outFields')).not.toMatch(/ACCOUNT|PARCEL|APN|OWNER|CREATED|EDIT/i);
      expect(params.get('returnDistinctValues')).toBe('true');
      expect(params.get('returnGeometry')).toBe('false');
      expect(params.get('resultRecordCount')).toBe('6');
      expect(params.get('where')).toContain("LIKE 'MAR%' ESCAPE '\\'");
    }
  });
});

describe('Chicago', () => {
  it('writes SoQL that keeps to the city and escapes quotes', () => {
    expect(chiPrefixWhere({ number: 233, direction: 'S', street: 'WAC' })).toBe(
      "addrnocom = '233' AND geocode_muni = 'CHICAGO' AND lst_predir = 'S' AND (starts_with(st_name, 'WAC'))",
    );
    expect(chiPrefixWhere({ number: 1, direction: null, street: "O'HARE ST" })).toContain(
      "starts_with(st_name, 'O''HARE ST')",
    );
  });

  it('reads rows as the line geocodeChi reads back, each address once', () => {
    const row = {
      addrnocom: '233',
      lst_predir: 'S',
      st_name: 'WACKER',
      lst_type: 'DR',
      st_posdir: null,
    };
    expect(parseChiSuggestions([row, row])).toEqual([
      { line: '233 S WACKER DR', place: 'Chicago', query: '233 S WACKER DR' },
    ]);
  });

  it('groups by the address parts, never the unit', async () => {
    const spy = mockFetch([]);
    await suggestChi('233 S Wac', 6);
    const params = askedUrl(spy).searchParams;
    expect(params.get('$select')).toBe('addrnocom,lst_predir,st_name,lst_type,st_posdir');
    expect(params.get('$group')).toBe(params.get('$select'));
    expect(params.get('$limit')).toBe('6');
  });
});
