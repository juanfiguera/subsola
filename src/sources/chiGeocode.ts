import { z } from 'zod';
import type { AddressSuggestion, GeocodedAddress } from './geocode';
import { soqlString, withinCircle } from './socrata';
import { soqlPrefix, streetGuesses, typedPrefix, uniqueBy, type TypedPrefix } from './suggestQuery';

/**
 * Chicago publishes no address locator, but Cook County's address points are public domain on
 * its Socrata portal, which browsers may query: every address in the county, with its parts filed
 * apart. A typed address is split into number, direction, name and type and asked for exactly,
 * within the City of Chicago.
 */
const ADDRESSES = 'https://datacatalog.cookcountyil.gov/resource/78yw-iddh.json';

/** How Chicago's streets and addresses are filed, where NYC files them by borough. */
export const CHI_BOROUGH = 'CHICAGO';

const FIELDS = 'addrnocom,lst_predir,st_name,lst_type,st_posdir,subaddcom,the_geom';

const pointSchema = z.object({
  addrnocom: z.string().nullish(),
  lst_predir: z.string().nullish(),
  st_name: z.string().nullish(),
  lst_type: z.string().nullish(),
  st_posdir: z.string().nullish(),
  subaddcom: z.string().nullish(),
  the_geom: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
});

type AddressPoint = z.infer<typeof pointSchema>;

// The street types as the county abbreviates them.
const TYPES: Record<string, string> = {
  STREET: 'ST',
  ST: 'ST',
  AVENUE: 'AVE',
  AVE: 'AVE',
  AV: 'AVE',
  BOULEVARD: 'BLVD',
  BLVD: 'BLVD',
  PLACE: 'PL',
  PL: 'PL',
  COURT: 'CT',
  CT: 'CT',
  DRIVE: 'DR',
  DR: 'DR',
  PARKWAY: 'PKWY',
  PKWY: 'PKWY',
  TERRACE: 'TER',
  TER: 'TER',
  ROAD: 'RD',
  RD: 'RD',
  LANE: 'LN',
  LN: 'LN',
  WAY: 'WAY',
  HIGHWAY: 'HWY',
  HWY: 'HWY',
  SQUARE: 'SQ',
  SQ: 'SQ',
  PLAZA: 'PLZ',
  PLZ: 'PLZ',
  CIRCLE: 'CIR',
  CIR: 'CIR',
};

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

// The county spells out the one street everybody shortens.
const KING = 'DOCTOR MARTIN LUTHER KING JR';

const ordinal = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'TH' : (['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH');
  return `${n}${suffix}`;
};

export interface ChiAddressParts {
  number: number;
  direction: string | null;
  name: string;
  type: string | null;
}

/**
 * "1060 W Addison St, Chicago, IL 60613" to its parts, the way the county files them: 1060, W,
 * ADDISON, ST. A bare street number takes its ordinal ("W 63 St" is W 63RD ST). Null for text
 * that isn't a house number and street.
 */
export const chiAddressParts = (text: string): ChiAddressParts | null => {
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
  const type = words.length > 1 ? (TYPES[words.at(-1)!] ?? null) : null;
  if (type) words.pop();
  const name = words
    .map((word) => (/^\d+$/.test(word) ? ordinal(Number(word)) : word))
    .join(' ')
    .trim();
  if (!name) return null;
  const king = /MARTIN LUTHER KING|^MLK$|^(DR )?KING( JR)?$/.test(name);
  return { number: Number(match[1]), direction, name: king ? KING : name, type };
};

/** The query for an address's points, from parts already cut down to letters and digits. */
export const chiAddressWhere = ({ number, direction, name, type }: ChiAddressParts) =>
  [
    `addrnocom = ${soqlString(String(number))}`,
    `st_name = ${soqlString(name)}`,
    `geocode_muni = '${CHI_BOROUGH}'`,
    ...(direction ? [`lst_predir = ${soqlString(direction)}`] : []),
    ...(type ? [`lst_type = ${soqlString(type)}`] : []),
  ].join(' AND ');

// The centerline writes Dr. King's street shorter than the county does.
const centerlineName = (name: string) => (name === KING ? 'DR MARTIN LUTHER KING JR' : name);

/** "S WACKER DR", as the city's centerline files it. */
const streetOf = (point: Omit<AddressPoint, 'the_geom'>) =>
  [
    point.lst_predir,
    point.st_name && centerlineName(point.st_name),
    point.lst_type,
    point.st_posdir,
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

const toAddress = (point: AddressPoint): GeocodedAddress => {
  const street = streetOf(point);
  // The county files in capitals; people write "1060 W Addison St" and "63rd".
  const spoken = street
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_, space: string, letter: string) => space + letter.toUpperCase());
  return {
    label: `${[point.addrnocom, spoken].filter(Boolean).join(' ')}, Chicago, IL`,
    lngLat: point.the_geom.coordinates,
    street,
    borough: CHI_BOROUGH,
    bbl: undefined,
  };
};

const getPoints = async (query: Record<string, string>, signal?: AbortSignal) => {
  const res = await fetch(`${ADDRESSES}?${new URLSearchParams(query)}`, { signal });
  if (!res.ok) throw new Error(`Cook County address points returned ${res.status}`);
  return z.array(pointSchema).parse(await res.json());
};

// A building's own address comes before its units, which sit on or near it.
const unitless = (point: AddressPoint) => !point.subaddcom?.trim();

export const geocodeChi = async (text: string, signal?: AbortSignal): Promise<GeocodedAddress> => {
  const parts = chiAddressParts(text);
  if (!parts) throw new Error(`No Chicago address found for "${text}"`);
  const points = await getPoints(
    { $select: FIELDS, $where: chiAddressWhere(parts), $limit: '50' },
    signal,
  );
  const match = points.find(unitless) ?? points[0];
  if (!match) throw new Error(`No Chicago address found for "${text}"`);
  return toAddress(match);
};

export const reverseGeocodeChi = async (
  [lng, lat]: [number, number],
  signal?: AbortSignal,
): Promise<GeocodedAddress> => {
  const points = await getPoints(
    {
      $select: FIELDS,
      $where: `${withinCircle('the_geom', lat, lng, 150)} AND geocode_muni = '${CHI_BOROUGH}'`,
      $limit: '200',
    },
    signal,
  );
  // Close enough to the city's middle latitude for ranking by flat distance.
  const squared = ({
    the_geom: {
      coordinates: [x, y],
    },
  }: AddressPoint) => ((x - lng) * Math.cos((lat * Math.PI) / 180)) ** 2 + (y - lat) ** 2;
  const nearest = points.filter(unitless).sort((a, b) => squared(a) - squared(b))[0];
  if (!nearest) throw new Error('No Chicago address near that spot');
  return toAddress(nearest);
};

/** The SoQL for addresses in the city with this number on a street starting with what's typed. */
export const chiPrefixWhere = ({ number, direction, street }: TypedPrefix) => {
  const { prefix, named } = streetGuesses(street, TYPES);
  const tests = [soqlPrefix('st_name', prefix)];
  if (named)
    tests.push(
      `(st_name = ${soqlString(named.name)} AND lst_type IN (${named.abbreviations
        .map(soqlString)
        .join(',')}))`,
    );
  return [
    `addrnocom = ${soqlString(String(number))}`,
    `geocode_muni = '${CHI_BOROUGH}'`,
    ...(direction ? [`lst_predir = ${soqlString(direction)}`] : []),
    `(${tests.join(' OR ')})`,
  ].join(' AND ');
};

// The parts of an address only, never the unit, so a building's units come back as one row.
const SUGGEST_FIELDS = 'addrnocom,lst_predir,st_name,lst_type,st_posdir';

const rowSchema = pointSchema.omit({ the_geom: true, subaddcom: true });

/** Each address once, as "233 S WACKER DR"; geocodeChi reads that back to the same point. */
export const parseChiSuggestions = (body: unknown): AddressSuggestion[] =>
  uniqueBy(
    z
      .array(rowSchema)
      .parse(body)
      .flatMap((row) => {
        const street = streetOf(row);
        return row.addrnocom && street ? [`${row.addrnocom} ${street}`] : [];
      }),
    (line) => line,
  ).map((line) => ({ line, place: 'Chicago', query: line }));

export const suggestChi = async (
  text: string,
  limit: number,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> => {
  const typed = typedPrefix(text);
  if (!typed) return [];
  const query = new URLSearchParams({
    $select: SUGGEST_FIELDS,
    $where: chiPrefixWhere(typed),
    $group: SUGGEST_FIELDS,
    $order: 'st_name,lst_type,lst_predir',
    $limit: String(limit),
  });
  const res = await fetch(`${ADDRESSES}?${query}`, { signal });
  if (!res.ok) throw new Error(`Cook County address points returned ${res.status}`);
  return parseChiSuggestions(await res.json());
};
