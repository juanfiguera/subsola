import { z } from 'zod';
import type { GeocodedAddress } from './geocode';

/**
 * King County's address point locator, public, keyless and open to browsers. It knows the whole
 * county, so only answers in Seattle count: "600 4th Ave" is also an address in Kirkland.
 */
const LOCATOR =
  'https://gismaps.kingcounty.gov/arcgis/rest/services/Address/Address_Points_locator/GeocodeServer';

// Below this the locator is guessing at a street, not finding an address.
const MIN_SCORE = 90;
const CITY = 'Seattle';

/** How Seattle's streets and addresses are filed, where NYC files them by borough. */
export const SEA_BOROUGH = 'SEATTLE';

const candidatesSchema = z.object({
  candidates: z.array(
    z.object({
      score: z.number(),
      location: z.object({ x: z.number(), y: z.number() }),
      attributes: z.object({ City: z.string().nullish(), StAddr: z.string().nullish() }),
    }),
  ),
});

const reverseSchema = z.object({
  address: z.object({ Address: z.string().nullish(), City: z.string().nullish() }).optional(),
  location: z.object({ x: z.number(), y: z.number() }).optional(),
});

// "600 4TH AVE" reads as "600 4th Ave".
const tidy = (address: string) =>
  address
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_, space: string, letter: string) => space + letter.toUpperCase());

const toAddress = (street: string, x: number, y: number): GeocodedAddress => ({
  label: `${tidy(street)}, Seattle, WA`,
  lngLat: [x, y],
  street: street.replace(/^[\d-]+[A-Z]?\s+/i, '').toUpperCase(),
  borough: SEA_BOROUGH,
  bbl: undefined,
});

const getJson = async (url: string, signal?: AbortSignal): Promise<unknown> => {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Seattle geocoder returned ${res.status}`);
  return res.json();
};

export const geocodeSea = async (text: string, signal?: AbortSignal): Promise<GeocodedAddress> => {
  const query = new URLSearchParams({
    SingleLine: text,
    outSR: '4326',
    maxLocations: '5',
    outFields: 'City,StAddr',
    f: 'json',
  });
  const { candidates } = candidatesSchema.parse(
    await getJson(`${LOCATOR}/findAddressCandidates?${query}`, signal),
  );
  const match = candidates.find(
    ({ score, attributes }) => score >= MIN_SCORE && attributes.City === CITY && attributes.StAddr,
  );
  if (!match) throw new Error(`No Seattle address found for "${text}"`);
  return toAddress(match.attributes.StAddr!, match.location.x, match.location.y);
};

export const reverseGeocodeSea = async (
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
    throw new Error('No Seattle address near that spot');
  return toAddress(found.address.Address, found.location.x, found.location.y);
};
