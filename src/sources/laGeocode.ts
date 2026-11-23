import { z } from 'zod';
import type { AddressSuggestion, GeocodedAddress } from './geocode';
import { locatorSuggest, sameAddressKey, uniqueBy, type LocatorSuggestion } from './suggestQuery';

/**
 * LA County's address locator, public, keyless and open to browsers. It knows the whole county,
 * so only answers in the City of Los Angeles count: Subsola has only the city's records, and
 * "1 Main St" would otherwise land in Alhambra.
 */
const LOCATOR = 'https://geocode.gis.lacounty.gov/geocode/rest/services/CAMS_Locator/GeocodeServer';

// Below this the locator is guessing at a street, not finding an address.
const MIN_SCORE = 90;
const CITY = 'Los Angeles';

/** How LA's streets and addresses are filed, where NYC files them by borough. */
export const LA_BOROUGH = 'LOS ANGELES';

const candidatesSchema = z.object({
  candidates: z.array(
    z.object({
      score: z.number(),
      location: z.object({ x: z.number(), y: z.number() }),
      attributes: z.object({
        City: z.string().nullish(),
        Addr_type: z.string().nullish(),
        StAddr: z.string().nullish(),
      }),
    }),
  ),
});

const reverseSchema = z.object({
  address: z.object({ Address: z.string().nullish(), City: z.string().nullish() }).optional(),
  location: z.object({ x: z.number(), y: z.number() }).optional(),
});

const toAddress = (street: string, x: number, y: number): GeocodedAddress => ({
  label: `${street}, Los Angeles, CA`,
  lngLat: [x, y],
  street: street.replace(/^[\d-]+[A-Z]?\s+/i, '').toUpperCase(),
  borough: LA_BOROUGH,
  bbl: undefined,
});

const getJson = async (url: string, signal?: AbortSignal): Promise<unknown> => {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`LA geocoder returned ${res.status}`);
  return res.json();
};

export const geocodeLa = async (
  text: string,
  signal?: AbortSignal,
  magicKey?: string,
): Promise<GeocodedAddress> => {
  const query = new URLSearchParams({
    SingleLine: text,
    outSR: '4326',
    maxLocations: '5',
    outFields: 'City,Addr_type,StAddr',
    f: 'json',
  });
  if (magicKey) query.set('magicKey', magicKey);
  const { candidates } = candidatesSchema.parse(
    await getJson(`${LOCATOR}/findAddressCandidates?${query}`, signal),
  );
  // Parcel matches lead with the assessor's number; the address points read as people write them.
  const match = candidates.find(
    ({ score, attributes }) =>
      score >= MIN_SCORE &&
      attributes.City === CITY &&
      attributes.Addr_type !== 'Parcel' &&
      attributes.StAddr,
  );
  if (!match) throw new Error(`No City of Los Angeles address found for "${text}"`);
  return toAddress(match.attributes.StAddr!, match.location.x, match.location.y);
};

export const reverseGeocodeLa = async (
  [lng, lat]: [number, number],
  signal?: AbortSignal,
): Promise<GeocodedAddress> => {
  const query = new URLSearchParams({
    location: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    distance: '150',
    outSR: '4326',
    f: 'json',
  });
  const found = reverseSchema.parse(await getJson(`${LOCATOR}/reverseGeocode?${query}`, signal));
  if (!found.address?.Address || found.address.City !== CITY || !found.location)
    throw new Error('No City of Los Angeles address near that spot');
  return toAddress(found.address.Address, found.location.x, found.location.y);
};

/**
 * The locator's suggestions as rows, only those in Los Angeles: the county locator also knows Glendale, Santa Monica and the rest, and names a few city neighborhoods (Sherman Oaks) as their own towns, which the geocoder turns away too. Each address can come
 * twice, spelled out and abbreviated, and shows once.
 */
export const parseLaSuggestions = (suggestions: LocatorSuggestion[]): AddressSuggestion[] =>
  uniqueBy(
    suggestions
      .map(({ text, magicKey }) => {
        const [line = '', city] = text.split(',').map((part) => part.trim());
        return { line, city, query: text, magicKey };
      })
      .filter(({ line, city }) => city === CITY && /^\d/.test(line)),
    ({ line }) => sameAddressKey(line),
  ).map(({ line, query, magicKey }) => ({ line, place: 'Los Angeles', query, magicKey }));

export const suggestLa = async (
  text: string,
  limit: number,
  extent: [number, number, number, number],
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> =>
  // Asks for more than it shows, since towns inside the city's box take some.
  parseLaSuggestions(await locatorSuggest(LOCATOR, text, { max: limit * 3, extent }, signal)).slice(
    0,
    limit,
  );
