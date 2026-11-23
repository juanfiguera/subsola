import { z } from 'zod';
import { soqlString } from './socrata';

/**
 * The pieces each city's type-ahead shares: reading a half-typed address, writing it into a
 * prefix query safely, and asking an ArcGIS locator's Suggest. Kept apart from suggest.ts, which
 * picks the cities, so each geocoder can use them without loading every region.
 */

/** "233 S Wac" as typed so far: a house number, maybe a direction, and the start of a street. */
export interface TypedPrefix {
  number: number;
  direction: string | null;
  /** The rest in capitals, letters and digits only: "WAC", "MARILLA ST". */
  street: string;
}

const DIRECTIONS: Record<string, string> = {
  N: 'N',
  NORTH: 'N',
  S: 'S',
  SOUTH: 'S',
  E: 'E',
  EAST: 'E',
  W: 'W',
  WEST: 'W',
};

/**
 * A house number and at least one letter or digit of the street, or null. The address-point
 * layers can only be asked by number and street, so "233" alone isn't worth a request there. A
 * lone direction ("233 S") stays the street's start, since it could be "South Shore Dr".
 */
export const typedPrefix = (text: string): TypedPrefix | null => {
  const first = text
    .split(',')[0]!
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const match = /^(\d+)\s+(.+)$/.exec(first);
  if (!match) return null;
  const words = match[2]!.split(' ');
  const direction = words.length > 1 ? (DIRECTIONS[words[0]!] ?? null) : null;
  if (direction) words.shift();
  return { number: Number(match[1]), direction, street: words.join(' ') };
};

/**
 * A quoted LIKE pattern for ArcGIS SQL matching anything that starts with `value`: quotes doubled
 * and the wildcards `%` and `_` (and the escape itself) escaped, so typed text can't widen or
 * break the query.
 */
export const likePrefix = (value: string) =>
  `'${value.replace(/[\\%_]/g, (char) => `\\${char}`).replace(/'/g, "''")}%' ESCAPE '\\'`;

/** Socrata's own prefix test; it takes no wildcards, so only the quotes need escaping. */
export const soqlPrefix = (column: string, value: string) =>
  `starts_with(${column}, ${soqlString(value)})`;

const ordinal = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'TH' : (['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH');
  return `${n}${suffix}`;
};

/**
 * The ways the typed street can match a city that files the type apart from the name: the whole
 * rest as the name's start ("MARTIN LU"), or a full name and the start of its type ("MARILLA ST",
 * "MARILLA STR"), as the abbreviations it could be. `types` maps the words people write to the
 * city's abbreviation.
 */
export const streetGuesses = (street: string, types: Record<string, string>) => {
  const words = street.split(' ');
  const last = words.at(-1)!;
  const name = words
    .slice(0, -1)
    .map((word) => (/^\d+$/.test(word) ? ordinal(Number(word)) : word))
    .join(' ');
  const abbreviations = [
    ...new Set(
      Object.entries(types)
        .filter(([word]) => word.startsWith(last))
        .map(([, abbreviation]) => abbreviation),
    ),
  ];
  return { prefix: street, named: name && abbreviations.length ? { name, abbreviations } : null };
};

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** What a layer's columns are called, for the shared prefix query below. */
export interface AddressColumns {
  number: string;
  direction: string;
  name: string;
  type: string;
  /** The street's whole name, where the layer keeps one: "E SANTA CLARA ST", "THE ALAMEDA". */
  fullName?: string;
}

/** The ArcGIS where clause for address points with this number on a street starting with what's typed. */
export const prefixWhere = (
  { number, direction, street }: TypedPrefix,
  columns: AddressColumns,
  types: Record<string, string>,
) => {
  const { prefix, named } = streetGuesses(street, types);
  const tests = [`UPPER(${columns.name}) LIKE ${likePrefix(prefix)}`];
  if (columns.fullName) tests.push(`UPPER(${columns.fullName}) LIKE ${likePrefix(prefix)}`);
  if (named)
    tests.push(
      `(UPPER(${columns.name}) = ${sqlString(named.name)} AND UPPER(${columns.type}) IN (${named.abbreviations
        .map(sqlString)
        .join(',')}))`,
    );
  return [
    `${columns.number} = ${number}`,
    ...(direction ? [`UPPER(${columns.direction}) = ${sqlString(direction)}`] : []),
    `(${tests.join(' OR ')})`,
  ].join(' AND ');
};

const suggestSchema = z.object({
  suggestions: z.array(z.object({ text: z.string(), magicKey: z.string().optional() })),
});

export type LocatorSuggestion = z.infer<typeof suggestSchema>['suggestions'][number];

/**
 * An ArcGIS locator's Suggest. `extent` keeps a county-wide locator to the city's box, so the
 * few rows it returns aren't spent on other towns.
 */
export const locatorSuggest = async (
  locator: string,
  text: string,
  { max, extent }: { max: number; extent?: [number, number, number, number] },
  signal?: AbortSignal,
): Promise<LocatorSuggestion[]> => {
  const query = new URLSearchParams({ text, maxSuggestions: String(max), f: 'json' });
  if (extent) {
    const [xmin, ymin, xmax, ymax] = extent;
    query.set(
      'searchExtent',
      JSON.stringify({ xmin, ymin, xmax, ymax, spatialReference: { wkid: 4326 } }),
    );
  }
  const res = await fetch(`${locator}/suggest?${query}`, { signal });
  if (!res.ok) throw new Error(`Suggest returned ${res.status}`);
  return suggestSchema.parse(await res.json()).suggestions;
};

// Spelled-out and abbreviated forms of the same address read as one row.
const SAME: Record<string, string> = {
  NORTH: 'N',
  SOUTH: 'S',
  EAST: 'E',
  WEST: 'W',
  STREET: 'ST',
  AVENUE: 'AVE',
  BOULEVARD: 'BLVD',
  DRIVE: 'DR',
  PLACE: 'PL',
  ROAD: 'RD',
  LANE: 'LN',
  COURT: 'CT',
};

/** A key that two spellings of one address share: "200 North Spring Street" and "200 N Spring St". */
export const sameAddressKey = (line: string) =>
  line
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => SAME[word] ?? word)
    .join(' ');

/** The first of each address, in order. */
export const uniqueBy = <T>(items: T[], key: (item: T) => string): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const itemKey = key(item);
    if (seen.has(itemKey)) return false;
    seen.add(itemKey);
    return true;
  });
};
