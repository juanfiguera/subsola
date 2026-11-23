import { z } from 'zod';
import type { AddressSuggestion, GeocodedAddress } from './geocode';
import { prefixWhere, typedPrefix } from './suggestQuery';

/**
 * Dallas publishes no address locator for the public, but its address points are an open layer
 * that browsers may query: every main address in the city, with its parts filed apart (units are
 * a separate layer, never asked). A typed address is split into number, direction, name and type,
 * and asked for exactly.
 */
const ADDRESSES =
  'https://services2.arcgis.com/rwnOSbfKSwyTBcwN/arcgis/rest/services/AddressPoints/FeatureServer/0/query';

/** How Dallas's streets and addresses are filed, where NYC files them by borough. */
export const DAL_BOROUGH = 'DALLAS';

// Never the account, parcel or editor fields the layer also carries.
const FIELDS = 'HOUSENUMBER,STREETPREDIRECTION,NAME,STREETTYPE,STREETPOSTDIRECTION';

const pointsSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        HOUSENUMBER: z.number().nullish(),
        STREETPREDIRECTION: z.string().nullish(),
        NAME: z.string().nullish(),
        STREETTYPE: z.string().nullish(),
        STREETPOSTDIRECTION: z.string().nullish(),
      }),
      geometry: z.object({ x: z.number(), y: z.number() }),
    }),
  ),
});

type AddressPoint = z.infer<typeof pointsSchema>['features'][number];

// The street types as the city abbreviates them.
const TYPES: Record<string, string> = {
  STREET: 'ST',
  ST: 'ST',
  AVENUE: 'AVE',
  AVE: 'AVE',
  AV: 'AVE',
  BOULEVARD: 'BLVD',
  BLVD: 'BLVD',
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
  TRAIL: 'TRL',
  TRL: 'TRL',
  PLACE: 'PL',
  PL: 'PL',
  PARKWAY: 'PKWY',
  PKWY: 'PKWY',
  FREEWAY: 'FWY',
  FWY: 'FWY',
  EXPRESSWAY: 'EXPY',
  EXPY: 'EXPY',
  HIGHWAY: 'HWY',
  HWY: 'HWY',
  PLAZA: 'PLZ',
  PLZ: 'PLZ',
  TERRACE: 'TER',
  TER: 'TER',
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

// The city spells out the boulevard everybody shortens.
const KING = 'MARTIN LUTHER KING JR';

const ordinal = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'TH' : (['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH');
  return `${n}${suffix}`;
};

export interface DalAddressParts {
  number: number;
  direction: string | null;
  name: string;
  type: string | null;
}

/**
 * "1500 Marilla St, Dallas, TX 75201" to its parts, the way the city files them: 1500, no
 * direction, MARILLA, ST. A bare street number takes its ordinal ("2 Ave" is 2ND AVE). Null for
 * text that isn't a house number and street.
 */
export const dalAddressParts = (text: string): DalAddressParts | null => {
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
  const king = /MARTIN LUTHER KING|^MLK( JR)?$|^(DR )?KING JR$/.test(name);
  return { number: Number(match[1]), direction, name: king ? KING : name, type };
};

/** The query for an address's points, from parts already cut down to letters and digits. */
export const dalAddressWhere = ({ number, direction, name, type }: DalAddressParts) =>
  [
    `HOUSENUMBER = ${number}`,
    `UPPER(NAME) = '${name}'`,
    ...(direction ? [`STREETPREDIRECTION = '${direction}'`] : []),
    ...(type ? [`UPPER(STREETTYPE) = '${type}'`] : []),
  ].join(' AND ');

/** "N CENTRAL EXPY", as the city's centerline files it. */
const streetOf = ({ attributes: a }: Pick<AddressPoint, 'attributes'>) =>
  [a.STREETPREDIRECTION, a.NAME, a.STREETTYPE, a.STREETPOSTDIRECTION]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

const toAddress = (point: AddressPoint): GeocodedAddress => {
  const street = streetOf(point);
  // The city files in capitals; people write "1500 Marilla St".
  const spoken = street
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_, space: string, letter: string) => space + letter.toUpperCase());
  return {
    label: `${[point.attributes.HOUSENUMBER, spoken].filter(Boolean).join(' ')}, Dallas, TX`,
    lngLat: [point.geometry.x, point.geometry.y],
    street,
    borough: DAL_BOROUGH,
    bbl: undefined,
  };
};

const getPoints = async (query: URLSearchParams, signal?: AbortSignal) => {
  const res = await fetch(`${ADDRESSES}?${query}`, { signal });
  if (!res.ok) throw new Error(`Dallas address points returned ${res.status}`);
  return pointsSchema.parse(await res.json()).features;
};

export const geocodeDal = async (text: string, signal?: AbortSignal): Promise<GeocodedAddress> => {
  const parts = dalAddressParts(text);
  if (!parts) throw new Error(`No Dallas address found for "${text}"`);
  const points = await getPoints(
    new URLSearchParams({
      where: dalAddressWhere(parts),
      outFields: FIELDS,
      returnGeometry: 'true',
      outSR: '4326',
      resultRecordCount: '50',
      f: 'json',
    }),
    signal,
  );
  // With no direction typed, a street that has none before one that does.
  const unsaid = (point: AddressPoint) =>
    !parts.direction && point.attributes.STREETPREDIRECTION?.trim() ? 1 : 0;
  const match = [...points].sort((a, b) => unsaid(a) - unsaid(b))[0];
  if (!match) throw new Error(`No Dallas address found for "${text}"`);
  return toAddress(match);
};

export const reverseGeocodeDal = async (
  [lng, lat]: [number, number],
  signal?: AbortSignal,
): Promise<GeocodedAddress> => {
  const points = await getPoints(
    new URLSearchParams({
      where: '1=1',
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
  if (!nearest) throw new Error('No Dallas address near that spot');
  return toAddress(nearest);
};

const rowsSchema = z.object({
  features: z.array(z.object({ attributes: pointsSchema.shape.features.element.shape.attributes })),
});

/** Each address once, as "1500 MARILLA ST"; geocodeDal reads that back to the same point. */
export const parseDalSuggestions = (body: unknown): AddressSuggestion[] =>
  rowsSchema.parse(body).features.flatMap((row) => {
    const street = streetOf(row);
    if (row.attributes.HOUSENUMBER == null || !street) return [];
    const line = `${row.attributes.HOUSENUMBER} ${street}`;
    return [{ line, place: 'Dallas', query: line }];
  });

export const suggestDal = async (
  text: string,
  limit: number,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> => {
  const typed = typedPrefix(text);
  if (!typed) return [];
  const query = new URLSearchParams({
    where: prefixWhere(
      typed,
      {
        number: 'HOUSENUMBER',
        direction: 'STREETPREDIRECTION',
        name: 'NAME',
        type: 'STREETTYPE',
        fullName: 'FULLSTREETNAME',
      },
      TYPES,
    ),
    outFields: FIELDS,
    // One row per address, not per suite; the point is found again when picked.
    returnDistinctValues: 'true',
    returnGeometry: 'false',
    orderByFields: 'NAME,STREETTYPE,STREETPREDIRECTION',
    resultRecordCount: String(limit),
    f: 'json',
  });
  const res = await fetch(`${ADDRESSES}?${query}`, { signal });
  if (!res.ok) throw new Error(`Dallas address points returned ${res.status}`);
  return parseDalSuggestions(await res.json());
};
