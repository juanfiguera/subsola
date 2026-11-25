import { z } from 'zod';
import type { AddressSuggestion } from './geocode';
import { readGzipJson } from './gzipJson';

/**
 * Subsola's own type-ahead: every street address in a city, cut into small files by the first
 * three characters of the address, so the search box fetches one file after the third keystroke
 * and filters it in the browser. What's typed never leaves the page. The nightly build writes the
 * files (pipeline/addresses.ts); this module is shared by both sides, so the build and the
 * browser normalize and cut addresses the same way.
 */

export const ADDRESS_INDEX_VERSION = 1;

// One spelling per word, so "200 North Spring Street" finds "200 N SPRING ST". Ordinals and
// names are left as they are.
const SAME: Record<string, string> = {
  NORTH: 'N',
  SOUTH: 'S',
  EAST: 'E',
  WEST: 'W',
  NORTHEAST: 'NE',
  NORTHWEST: 'NW',
  SOUTHEAST: 'SE',
  SOUTHWEST: 'SW',
  STREET: 'ST',
  AVENUE: 'AVE',
  AV: 'AVE',
  BOULEVARD: 'BLVD',
  DRIVE: 'DR',
  PLACE: 'PL',
  ROAD: 'RD',
  LANE: 'LN',
  COURT: 'CT',
  TERRACE: 'TER',
  PARKWAY: 'PKWY',
  HIGHWAY: 'HWY',
  EXPRESSWAY: 'EXPY',
  SQUARE: 'SQ',
  CIRCLE: 'CIR',
  PLAZA: 'PLZ',
};

/**
 * An address in one spelling: capitals, letters, digits and the hyphen in Queens house numbers
 * ("104-20"), single spaces, long words shortened. A trailing space is kept, since "12 " (a whole
 * number) and "12" (the start of 120, 1200...) cut to different files.
 */
export const normalizeAddress = (text: string): string => {
  const cleaned = text
    .split(',')[0]!
    .toUpperCase()
    .replace(/[^A-Z0-9\- ]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^ /, '');
  const trailing = cleaned.endsWith(' ');
  const words = cleaned.trim().split(' ');
  // The last word may still be half typed ("STRE"), so only whole words before it are shortened.
  // Street ordinals lose their ending, since cities file "52 ST" and people type "52nd St"; a
  // half-typed one ("52N") does too. The house number, the first word, keeps its letters (12A).
  const shortened = words.map((word, i) => {
    const whole = i < words.length - 1 || trailing;
    if (i > 0 && (whole ? /^\d+(ST|ND|RD|TH)$/ : /^\d+(S|N|R|T|ST|ND|RD|TH)$/).test(word))
      return word.replace(/[A-Z]+$/, '');
    return whole ? (SAME[word] ?? word) : word;
  });
  return shortened.join(' ') + (trailing ? ' ' : '');
};

/** A street alone, normalized as it would be after a house number ("4TH AVE" to "4 AVE "). */
const normalizeStreet = (street: string) => normalizeAddress(`0 ${street} `).slice(2);

/** How many characters pick a file. */
export const KEY_LENGTH = 3;

/** The file a normalized address belongs to, or null when too little is typed to pick one. */
export const indexKey = (normalized: string): string | null =>
  normalized.length >= KEY_LENGTH ? normalized.slice(0, KEY_LENGTH) : null;

/** The file's name in the bucket: spaces and hyphens spelled out, so keys are safe paths. */
export const keyFile = (key: string) => key.replace(/ /g, '_').replace(/-/g, '~');

export const addressFileUrl = (base: string, city: string, key: string) =>
  `${base}/addresses/v${ADDRESS_INDEX_VERSION}/${city}/${encodeURIComponent(keyFile(key))}.json.gz`;

/** Which files each city has, so the browser never asks for one that isn't there. */
export const addressManifestSchema = z.object({
  v: z.literal(ADDRESS_INDEX_VERSION),
  cities: z.record(z.string(), z.array(z.string())),
});
export type AddressManifest = z.infer<typeof addressManifestSchema>;

export const ADDRESS_MANIFEST = `addresses/v${ADDRESS_INDEX_VERSION}/index.json.gz`;

/**
 * One file: the places its addresses are in ("Manhattan", "Dallas"), and each street once with
 * its house numbers. Grouping by street keeps a file of thousands of addresses to tens of KB.
 */
export const addressFileSchema = z.object({
  v: z.literal(ADDRESS_INDEX_VERSION),
  places: z.array(z.string()),
  /** [the street as the city spells it, index into `places`, house numbers as text] */
  streets: z.array(z.tuple([z.string(), z.number().int().nonnegative(), z.array(z.string())])),
});
export type AddressFile = z.infer<typeof addressFileSchema>;

/** A street address as the build reads it from a city's address points. */
export interface IndexedAddress {
  number: string;
  street: string;
  place: string;
}

/** Addresses grouped into files by key, ready to write. */
export const buildAddressFiles = (addresses: IndexedAddress[]): Map<string, AddressFile> => {
  const byKey = new Map<
    string,
    Map<string, { street: string; place: string; numbers: Set<string> }>
  >();
  for (const { number, street, place } of addresses) {
    const cleanNumber = number.trim().toUpperCase();
    const cleanStreet = street.trim().replace(/\s+/g, ' ');
    // San Diego files placeholder points as house number 0; no one lives at 0 Broadway.
    if (!/^\d/.test(cleanNumber) || /^0+$/.test(cleanNumber) || !cleanStreet) continue;
    const key = indexKey(normalizeAddress(`${cleanNumber} ${cleanStreet} `));
    if (!key) continue;
    const streets = byKey.get(key) ?? new Map();
    byKey.set(key, streets);
    const streetKey = `${cleanStreet.toUpperCase()}|${place}`;
    const entry = streets.get(streetKey) ?? { street: cleanStreet, place, numbers: new Set() };
    streets.set(streetKey, entry);
    entry.numbers.add(cleanNumber);
  }
  const files = new Map<string, AddressFile>();
  for (const [key, streets] of byKey) {
    const places = [...new Set([...streets.values()].map((entry) => entry.place))].sort();
    files.set(key, {
      v: ADDRESS_INDEX_VERSION,
      places,
      streets: [...streets.values()]
        .sort((a, b) => a.street.localeCompare(b.street) || a.place.localeCompare(b.place))
        .map((entry) => [
          entry.street,
          places.indexOf(entry.place),
          [...entry.numbers].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
        ]),
    });
  }
  return files;
};

/**
 * The addresses in a file that start with what's typed, best first: a whole house number typed
 * ("233 ") matches that number exactly, a number still being typed ("23") matches every number
 * starting with it, and the street matches from its start in either spelling. Exact numbers come
 * before longer ones, then streets in order.
 */
export const matchAddressFile = (
  file: AddressFile,
  typed: string,
  limit: number,
): Omit<AddressSuggestion, 'query'>[] => {
  const normalized = normalizeAddress(typed);
  const match = /^(\d[\dA-Z-]*)( (.*))?$/.exec(normalized.trimEnd());
  if (!match) return [];
  const typedNumber = match[1]!;
  const numberDone = match[2] !== undefined || normalized.endsWith(' ');
  const typedStreet = (match[3] ?? '').trimEnd();
  const rows: { line: string; place: string; exact: boolean }[] = [];
  for (const [street, placeIndex, numbers] of file.streets) {
    if (
      typedStreet &&
      !normalizeStreet(street).startsWith(typedStreet) &&
      !street.toUpperCase().startsWith(typedStreet)
    )
      continue;
    for (const number of numbers) {
      const exact = number === typedNumber;
      if (numberDone ? !exact : !number.startsWith(typedNumber)) continue;
      rows.push({ line: `${number} ${street}`, place: file.places[placeIndex] ?? '', exact });
    }
  }
  rows.sort((a, b) => Number(b.exact) - Number(a.exact));
  return rows.slice(0, limit).map(({ line, place }) => ({ line, place }));
};

/**
 * The browser's side: the manifest once a visit, each file once, both kept in memory. `lookup`
 * answers null for a city with no index tonight, so the caller asks the city's own lookup
 * instead, and an empty list for a key with no addresses, without a request.
 */
export const createAddressIndex = (base: string, fetcher: typeof fetch = fetch) => {
  let manifest: Promise<AddressManifest | null> | null = null;
  const files = new Map<string, Promise<AddressFile | null>>();
  const getJson = async (url: string, signal?: AbortSignal) => {
    const res = await fetcher(url, { signal });
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return readGzipJson(res);
  };
  const loadManifest = () => {
    // A failed manifest isn't kept, so the next keystroke tries again; until then, city lookups.
    manifest ??= getJson(`${base}/${ADDRESS_MANIFEST}`)
      .then((body) => addressManifestSchema.parse(body))
      .catch(() => {
        manifest = null;
        return null;
      });
    return manifest;
  };
  const loadFile = (city: string, key: string) => {
    const id = `${city}/${key}`;
    let file = files.get(id);
    if (!file) {
      file = getJson(addressFileUrl(base, city, key))
        .then((body) => addressFileSchema.parse(body))
        .catch(() => {
          files.delete(id);
          return null;
        });
      files.set(id, file);
    }
    return file;
  };
  return {
    lookup: async (
      city: string,
      typed: string,
      limit: number,
    ): Promise<Omit<AddressSuggestion, 'query'>[] | null> => {
      const key = indexKey(normalizeAddress(typed));
      const known = (await loadManifest())?.cities[city];
      if (!known) return null;
      if (!key || !known.includes(key)) return [];
      const file = await loadFile(city, key);
      return file ? matchAddressFile(file, typed, limit) : null;
    },
  };
};

export type AddressIndex = ReturnType<typeof createAddressIndex>;
