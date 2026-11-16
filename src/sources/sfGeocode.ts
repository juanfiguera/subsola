import { z } from 'zod';
import type { GeocodedAddress } from './geocode';

/**
 * San Francisco's own locators, public, keyless and open to browsers. The first knows every
 * address in the city's Enterprise Addressing System; the second places a number along the
 * street, for the few houses EAS lacks ("2350 29th Ave"). Both know only San Francisco.
 */
const LOCATORS = 'https://gis.sf.gov/svc/rest/services/loc';
const ADDRESSES = `${LOCATORS}/eas_addresses_gc_locator/GeocodeServer`;
const STREETS = `${LOCATORS}/sfgis_stclines_locator/GeocodeServer`;

// Below this the locator is guessing at a street, not finding an address.
const MIN_SCORE = 90;

/** How San Francisco's streets and addresses are filed, where NYC files them by borough. */
export const SF_BOROUGH = 'SAN FRANCISCO';

const candidatesSchema = z.object({
  candidates: z.array(
    z.object({
      address: z.string(),
      score: z.number(),
      location: z.object({ x: z.number(), y: z.number() }),
    }),
  ),
});

const reverseSchema = z.object({
  address: z.object({ Match_addr: z.string() }).optional(),
  location: z.object({ x: z.number(), y: z.number() }).optional(),
});

// "1 DR CARLTON B GOODLETT PL" reads as "1 Dr Carlton B Goodlett Pl"; "29TH" as "29th".
const tidy = (address: string) =>
  address
    .toLowerCase()
    .replace(
      /(^|[\s-])([a-z])/g,
      (_, space: string, letter: string) => space + letter.toUpperCase(),
    );

/** The house number and street out of "City Hall, 1 DR CARLTON B GOODLETT PL, San Francisco, ...". */
const streetAddress = (matched: string) =>
  matched
    .split(',')
    .map((part) => part.trim())
    .find((part) => /^\d/.test(part)) ?? null;

const toAddress = (address: string, x: number, y: number): GeocodedAddress => ({
  label: `${tidy(address)}, San Francisco, CA`,
  lngLat: [x, y],
  street: address.replace(/^[\d-]+[A-Z]?\s+/, ''),
  borough: SF_BOROUGH,
  bbl: undefined,
});

const getJson = async (url: string, signal?: AbortSignal): Promise<unknown> => {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`SF geocoder returned ${res.status}`);
  return res.json();
};

const firstMatch = async (locator: string, line: string, signal?: AbortSignal) => {
  const query = new URLSearchParams({
    SingleLine: line,
    outSR: '4326',
    maxLocations: '1',
    f: 'json',
  });
  const [match] = candidatesSchema.parse(
    await getJson(`${locator}/findAddressCandidates?${query}`, signal),
  ).candidates;
  return match && match.score >= MIN_SCORE ? match : null;
};

export const geocodeSf = async (text: string, signal?: AbortSignal): Promise<GeocodedAddress> => {
  const line = text.replace(/,?\s*(san francisco|sf)(,?\s*ca(lifornia)?)?(\s+\d{5})?\s*$/i, '');
  const match =
    (await firstMatch(ADDRESSES, line, signal)) ?? (await firstMatch(STREETS, line, signal));
  const street = match && streetAddress(match.address);
  if (!match || !street) throw new Error(`No San Francisco address found for "${text}"`);
  return toAddress(street, match.location.x, match.location.y);
};

export const reverseGeocodeSf = async (
  [lng, lat]: [number, number],
  signal?: AbortSignal,
): Promise<GeocodedAddress> => {
  const query = new URLSearchParams({
    location: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    featureTypes: 'PointAddress',
    distance: '150',
    outSR: '4326',
    f: 'json',
  });
  const found = reverseSchema.parse(await getJson(`${ADDRESSES}/reverseGeocode?${query}`, signal));
  const street = found.address && streetAddress(found.address.Match_addr);
  if (!street || !found.location) throw new Error('No San Francisco address near that spot');
  return toAddress(street, found.location.x, found.location.y);
};
