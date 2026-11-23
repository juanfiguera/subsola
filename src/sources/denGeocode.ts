import { z } from 'zod';
import type { AddressSuggestion, GeocodedAddress } from './geocode';
import { prefixWhere, typedPrefix } from './suggestQuery';

/**
 * Denver publishes no address locator, but its address points are an open layer that browsers
 * may query: every active address in the City and County, with its parts filed apart. A typed
 * address is split into number, direction, name and type, and asked for exactly.
 */
const ADDRESSES =
  'https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_CITY_LOC_ADDRESSPUBLIC_P/FeatureServer/31/query';

/** How Denver's streets and addresses are filed, where NYC files them by borough. */
export const DEN_BOROUGH = 'DENVER';

const FIELDS = 'ADDRESS_NUMBER,PREDIRECTIONAL,STREET_NAME,POSTTYPE,BUILDING_TYPE,UNIT_TYPE';

const pointsSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        ADDRESS_NUMBER: z.number().nullish(),
        PREDIRECTIONAL: z.string().nullish(),
        STREET_NAME: z.string().nullish(),
        POSTTYPE: z.string().nullish(),
        BUILDING_TYPE: z.string().nullish(),
        UNIT_TYPE: z.string().nullish(),
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
  PLACE: 'PL',
  PL: 'PL',
  COURT: 'CT',
  CT: 'CT',
  DRIVE: 'DR',
  DR: 'DR',
  WAY: 'WAY',
  PARKWAY: 'PKWY',
  PKWY: 'PKWY',
  CIRCLE: 'CIR',
  CIR: 'CIR',
  LANE: 'LN',
  LN: 'LN',
  ROAD: 'RD',
  RD: 'RD',
  TERRACE: 'TER',
  TER: 'TER',
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

const ordinal = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'TH' : (['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH');
  return `${n}${suffix}`;
};

export interface DenAddressParts {
  number: number;
  direction: string | null;
  name: string;
  type: string | null;
}

/**
 * "1437 Bannock St, Denver, CO 80202" to its parts, the way the city files them: 1437, no
 * direction, BANNOCK, ST. A bare street number takes its ordinal ("E 17 Ave" is E 17TH AVE).
 * Null for text that isn't a house number and street.
 */
export const denAddressParts = (text: string): DenAddressParts | null => {
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
  return { number: Number(match[1]), direction, name, type };
};

/** The query for an address's points, from parts already cut down to letters and digits. */
export const denAddressWhere = ({ number, direction, name, type }: DenAddressParts) =>
  [
    `ADDRESS_NUMBER = ${number}`,
    `UPPER(STREET_NAME) = '${name}'`,
    ...(direction ? [`PREDIRECTIONAL = '${direction}'`] : []),
    ...(type ? [`UPPER(POSTTYPE) = '${type}'`] : []),
  ].join(' AND ');

// Denver writes "N" before every north-side address on a north-south street, which nobody says
// and Denver Water's inventory leaves out: "1437 N Bannock St" is 1437 Bannock St.
const spoken = ({ attributes: a }: Pick<AddressPoint, 'attributes'>) =>
  [a.ADDRESS_NUMBER, a.PREDIRECTIONAL === 'N' ? null : a.PREDIRECTIONAL, a.STREET_NAME, a.POSTTYPE]
    .filter(Boolean)
    .join(' ');

const toAddress = (point: AddressPoint): GeocodedAddress => {
  const { attributes: a } = point;
  return {
    label: `${spoken(point)}, Denver, CO`,
    lngLat: [point.geometry.x, point.geometry.y],
    // As the centerline files it, direction included.
    street: [a.PREDIRECTIONAL, a.STREET_NAME, a.POSTTYPE].filter(Boolean).join(' ').toUpperCase(),
    borough: DEN_BOROUGH,
    bbl: undefined,
  };
};

const getPoints = async (query: URLSearchParams, signal?: AbortSignal) => {
  const res = await fetch(`${ADDRESSES}?${query}`, { signal });
  if (!res.ok) throw new Error(`Denver address points returned ${res.status}`);
  return pointsSchema.parse(await res.json()).features;
};

// A building's own address comes before its buildings and units, which sit on or near it.
const unitless = (point: AddressPoint) =>
  !point.attributes.UNIT_TYPE?.trim() && !point.attributes.BUILDING_TYPE?.trim();

export const geocodeDen = async (text: string, signal?: AbortSignal): Promise<GeocodedAddress> => {
  const parts = denAddressParts(text);
  if (!parts) throw new Error(`No Denver address found for "${text}"`);
  const points = await getPoints(
    new URLSearchParams({
      where: denAddressWhere(parts),
      outFields: FIELDS,
      returnGeometry: 'true',
      outSR: '4326',
      resultRecordCount: '50',
      f: 'json',
    }),
    signal,
  );
  // With no direction typed, the one nobody says: "1600 Broadway" is N Broadway, not S.
  const unsaid = (point: AddressPoint) =>
    !parts.direction && point.attributes.PREDIRECTIONAL === 'N' ? 0 : 1;
  const match = points.filter(unitless).sort((a, b) => unsaid(a) - unsaid(b))[0] ?? points[0];
  if (!match) throw new Error(`No Denver address found for "${text}"`);
  return toAddress(match);
};

export const reverseGeocodeDen = async (
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
  const nearest = points.filter(unitless).sort((a, b) => squared(a) - squared(b))[0];
  if (!nearest) throw new Error('No Denver address near that spot');
  return toAddress(nearest);
};

const rowsSchema = z.object({
  features: z.array(z.object({ attributes: pointsSchema.shape.features.element.shape.attributes })),
});

/** Each address once, as people say it ("1437 Bannock St"); geocodeDen reads that back. */
export const parseDenSuggestions = (body: unknown): AddressSuggestion[] =>
  rowsSchema.parse(body).features.flatMap((row) => {
    if (row.attributes.ADDRESS_NUMBER == null || !row.attributes.STREET_NAME) return [];
    const line = spoken(row);
    return [{ line, place: 'Denver', query: line }];
  });

// Only the parts of an address, never the building or unit, so each address comes once.
const SUGGEST_FIELDS = 'ADDRESS_NUMBER,PREDIRECTIONAL,STREET_NAME,POSTTYPE';

export const suggestDen = async (
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
        number: 'ADDRESS_NUMBER',
        direction: 'PREDIRECTIONAL',
        name: 'STREET_NAME',
        type: 'POSTTYPE',
      },
      TYPES,
    ),
    outFields: SUGGEST_FIELDS,
    returnDistinctValues: 'true',
    returnGeometry: 'false',
    orderByFields: 'STREET_NAME,POSTTYPE,PREDIRECTIONAL',
    resultRecordCount: String(limit),
    f: 'json',
  });
  const res = await fetch(`${ADDRESSES}?${query}`, { signal });
  if (!res.ok) throw new Error(`Denver address points returned ${res.status}`);
  return parseDenSuggestions(await res.json());
};
