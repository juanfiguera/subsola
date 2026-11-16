import { z } from 'zod';
import type { GeocodedAddress } from './geocode';

/**
 * The City of San Diego's own address locator, public, keyless and open to browsers. It knows
 * only the city's addresses, filed by ZIP with no city name, so "San Diego" in a typed address
 * only costs it score and is taken out before asking.
 */
const LOCATOR =
  'https://webmaps.sandiego.gov/arcgis/rest/services/Locators/StreetAddress/GeocodeServer';

// Below this the locator is guessing at a street, not finding an address.
const MIN_SCORE = 90;

/** How San Diego's streets and addresses are filed, where NYC files them by borough. */
export const SD_BOROUGH = 'SAN DIEGO';

const candidatesSchema = z.object({
  candidates: z.array(
    z.object({
      score: z.number(),
      location: z.object({ x: z.number(), y: z.number() }),
      attributes: z.object({
        Addr_type: z.string().nullish(),
        StAddr: z.string().nullish(),
      }),
    }),
  ),
});

const reverseSchema = z.object({
  address: z.object({ Address: z.string().nullish() }).optional(),
  location: z.object({ x: z.number(), y: z.number() }).optional(),
});

// "100 W BROADWAY" reads as "100 W Broadway"; "5TH" as "5th".
const tidy = (address: string) =>
  address
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_, space: string, letter: string) => space + letter.toUpperCase());

const toAddress = (street: string, x: number, y: number): GeocodedAddress => ({
  label: `${tidy(street)}, San Diego, CA`,
  lngLat: [x, y],
  street: street.replace(/^[\d-]+[A-Z]?\s+/i, '').toUpperCase(),
  borough: SD_BOROUGH,
  bbl: undefined,
});

const getJson = async (url: string, signal?: AbortSignal): Promise<unknown> => {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`San Diego geocoder returned ${res.status}`);
  return res.json();
};

/** "100 W Broadway, San Diego, CA 92101" to "100 W Broadway, 92101", the way the locator files it. */
export const sdQuery = (text: string) =>
  text
    .replace(/,?\s*san diego\b/i, '')
    .replace(/,?\s*\b(CA|california)\b/i, '')
    .replace(/\s*,\s*,/g, ',')
    .replace(/,\s*$/, '')
    .trim();

export const geocodeSd = async (text: string, signal?: AbortSignal): Promise<GeocodedAddress> => {
  const query = new URLSearchParams({
    SingleLine: sdQuery(text),
    outSR: '4326',
    maxLocations: '5',
    outFields: 'Addr_type,StAddr',
    f: 'json',
  });
  const { candidates } = candidatesSchema.parse(
    await getJson(`${LOCATOR}/findAddressCandidates?${query}`, signal),
  );
  // A street-name match is the middle of a street, not the address asked for.
  const match = candidates.find(
    ({ score, attributes }) =>
      score >= MIN_SCORE && attributes.Addr_type?.startsWith('StreetAddress') && attributes.StAddr,
  );
  if (!match) throw new Error(`No City of San Diego address found for "${text}"`);
  return toAddress(match.attributes.StAddr!, match.location.x, match.location.y);
};

export const reverseGeocodeSd = async (
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
  if (!found.address?.Address || !found.location)
    throw new Error('No City of San Diego address near that spot');
  return toAddress(found.address.Address, found.location.x, found.location.y);
};
