import { z } from 'zod';
import type { GeocodedAddress } from './geocode';

/**
 * San Jose's site address points are an open layer (CC BY) that browsers may query: every
 * address in the city, with its parts filed apart. A typed address is split into number,
 * direction, name and type; the points with that number whose full street name holds the name are
 * asked for, and the one that agrees best wins. Never the parcel, account or editor fields the
 * layer also carries.
 */
const ADDRESSES =
  'https://geo.sanjoseca.gov/server/rest/services/OPN/OPN_OpenDataService/MapServer/36/query';

/** How San Jose's streets and addresses are filed, where NYC files them by borough. */
export const SJ_BOROUGH = 'SAN JOSE';

const FIELDS = 'Add_Number,St_PreDirAbbr,St_PreTyp,StreetName,St_PosTypUSPS,St_PosDir,Status';

const pointsSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        Add_Number: z.number().nullish(),
        St_PreDirAbbr: z.string().nullish(),
        St_PreTyp: z.string().nullish(),
        StreetName: z.string().nullish(),
        St_PosTypUSPS: z.string().nullish(),
        St_PosDir: z.string().nullish(),
        Status: z.string().nullish(),
      }),
      geometry: z.object({ x: z.number(), y: z.number() }),
    }),
  ),
});

type AddressPoint = z.infer<typeof pointsSchema>['features'][number];

// Street types as the USPS abbreviates them, which is how the layer's full names write them.
const TYPES: Record<string, string> = {
  STREET: 'ST',
  ST: 'ST',
  AVENUE: 'AVE',
  AVE: 'AVE',
  AV: 'AVE',
  BOULEVARD: 'BLVD',
  BLVD: 'BLVD',
  BL: 'BLVD',
  DRIVE: 'DR',
  DR: 'DR',
  LANE: 'LN',
  LN: 'LN',
  ROAD: 'RD',
  RD: 'RD',
  CIRCLE: 'CIR',
  CIR: 'CIR',
  COURT: 'CT',
  CT: 'CT',
  WAY: 'WAY',
  WY: 'WAY',
  PLACE: 'PL',
  PL: 'PL',
  PARKWAY: 'PKWY',
  PKWY: 'PKWY',
  PY: 'PKWY',
  EXPRESSWAY: 'EXPY',
  EXPY: 'EXPY',
  HIGHWAY: 'HWY',
  HWY: 'HWY',
  PLAZA: 'PLZ',
  PLZ: 'PLZ',
  TERRACE: 'TER',
  TER: 'TER',
  TRAIL: 'TRL',
  TRL: 'TRL',
  LOOP: 'LOOP',
  ROW: 'ROW',
  ALLEY: 'ALY',
  ALY: 'ALY',
  COMMON: 'CMN',
  CMN: 'CMN',
  COMMONS: 'CMNS',
  CMNS: 'CMNS',
  LANDING: 'LNDG',
  LNDG: 'LNDG',
  WALKWAY: 'WKWY',
  WKWY: 'WKWY',
  SQUARE: 'SQ',
  SQ: 'SQ',
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

// Downtown's numbered streets, which people spell out as often as not.
const SPELLED: Record<string, string> = {
  FIRST: '1ST',
  SECOND: '2ND',
  THIRD: '3RD',
  FOURTH: '4TH',
  FIFTH: '5TH',
  SIXTH: '6TH',
  SEVENTH: '7TH',
  EIGHTH: '8TH',
  NINTH: '9TH',
  TENTH: '10TH',
};

const ordinal = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'TH' : (['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH');
  return `${n}${suffix}`;
};

export interface SjAddressParts {
  number: number;
  direction: string | null;
  name: string;
  type: string | null;
}

/**
 * "200 E Santa Clara St, San Jose, CA 95113" to its parts: 200, E, SANTA CLARA, ST. A bare
 * street number takes its ordinal ("1 St" is 1ST ST), and "First" is 1ST. "The Alameda" keeps its
 * article. Null for text that isn't a house number and street.
 */
export const sjAddressParts = (text: string): SjAddressParts | null => {
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
    .map((word) => SPELLED[word] ?? (/^\d+$/.test(word) ? ordinal(Number(word)) : word))
    .join(' ')
    .trim();
  if (!name) return null;
  return { number: Number(match[1]), direction, name, type };
};

/** The query for an address's points, from parts already cut down to letters and digits. */
export const sjAddressWhere = ({ number, name }: SjAddressParts) =>
  `Add_Number = ${number} AND UPPER(FullName) LIKE '%${name}%'`;

const upper = (value: string | null | undefined) => value?.trim().toUpperCase() ?? '';

/**
 * How far a point is from what was typed, lowest first: the street's own name must match (so
 * "1ST" doesn't take "21ST"), then the direction, the type, and an active address over a retired
 * one.
 */
export const sjMismatch = (parts: SjAddressParts, { attributes: a }: AddressPoint) => {
  const name = upper(a.StreetName);
  const withPrefix = [upper(a.St_PreTyp), name].filter(Boolean).join(' ');
  if (name !== parts.name && withPrefix !== parts.name) return Infinity;
  const direction = upper(a.St_PreDirAbbr) || null;
  const type = upper(a.St_PosTypUSPS) || null;
  return (
    (parts.direction && direction !== parts.direction ? 4 : 0) +
    (!parts.direction && direction ? 1 : 0) +
    (parts.type && type !== parts.type ? 2 : 0) +
    (upper(a.Status) === 'ACTIVE' ? 0 : 8)
  );
};

/** "E SANTA CLARA ST", as the city's centerline files it. */
const streetOf = ({ attributes: a }: AddressPoint) =>
  [a.St_PreDirAbbr, a.St_PreTyp, a.StreetName, a.St_PosTypUSPS, a.St_PosDir]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

const toAddress = (point: AddressPoint): GeocodedAddress => {
  const street = streetOf(point);
  const spoken = street
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_, space: string, letter: string) => space + letter.toUpperCase())
    // "1St" back to "1st".
    .replace(
      /\b(\d+)(St|Nd|Rd|Th)\b/g,
      (_, digits: string, suffix: string) => `${digits}${suffix.toLowerCase()}`,
    );
  return {
    label: `${[point.attributes.Add_Number, spoken].filter(Boolean).join(' ')}, San Jose, CA`,
    lngLat: [point.geometry.x, point.geometry.y],
    street,
    borough: SJ_BOROUGH,
    bbl: undefined,
  };
};

const getPoints = async (query: URLSearchParams, signal?: AbortSignal) => {
  const res = await fetch(`${ADDRESSES}?${query}`, { signal });
  if (!res.ok) throw new Error(`San Jose address points returned ${res.status}`);
  return pointsSchema.parse(await res.json()).features;
};

export const geocodeSj = async (text: string, signal?: AbortSignal): Promise<GeocodedAddress> => {
  const parts = sjAddressParts(text);
  if (!parts) throw new Error(`No San Jose address found for "${text}"`);
  const points = await getPoints(
    new URLSearchParams({
      where: sjAddressWhere(parts),
      outFields: FIELDS,
      returnGeometry: 'true',
      outSR: '4326',
      resultRecordCount: '100',
      f: 'json',
    }),
    signal,
  );
  const ranked = points
    .map((point) => ({ point, miss: sjMismatch(parts, point) }))
    .filter(({ miss }) => Number.isFinite(miss))
    .sort((a, b) => a.miss - b.miss);
  const match = ranked[0]?.point;
  if (!match) throw new Error(`No San Jose address found for "${text}"`);
  return toAddress(match);
};

export const reverseGeocodeSj = async (
  [lng, lat]: [number, number],
  signal?: AbortSignal,
): Promise<GeocodedAddress> => {
  const points = await getPoints(
    new URLSearchParams({
      where: "Status = 'Active'",
      geometry: `${lng},${lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      distance: '150',
      units: 'esriSRUnit_Meter',
      outFields: FIELDS,
      returnGeometry: 'true',
      outSR: '4326',
      resultRecordCount: '200',
      f: 'json',
    }),
    signal,
  );
  // Close enough to the city's middle latitude for ranking by flat distance.
  const squared = ({ geometry: { x, y } }: AddressPoint) =>
    ((x - lng) * Math.cos((lat * Math.PI) / 180)) ** 2 + (y - lat) ** 2;
  const nearest = [...points].sort((a, b) => squared(a) - squared(b))[0];
  if (!nearest) throw new Error('No San Jose address near that spot');
  return toAddress(nearest);
};
