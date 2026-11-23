import { z } from 'zod';
import type { AddressSuggestion, GeocodedAddress } from './geocode';
import { locatorSuggest, type LocatorSuggestion } from './suggestQuery';
import { pause } from './pause';

/**
 * DC GIS's address locator, backed by the District's Master Address Repository. Public, keyless
 * and open to browsers. It answers in upper case ("800 F STREET NW") and knows only DC.
 */
const LOCATOR = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_APPS/DCGIS_MAR/GeocodeServer';

// Below this the locator is guessing at a street, not finding an address.
const MIN_SCORE = 80;

/** How DC's streets and addresses are filed, where NYC files them by borough. */
export const DC_BOROUGH = 'WASHINGTON';

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
  error: z.object({ message: z.string() }).optional(),
});

// "800 F STREET NW" reads as "800 F Street NW": quadrants and lettered streets stay capitals.
const tidy = (address: string) =>
  address
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\b(Nw|Ne|Sw|Se)\b/g, (quadrant) => quadrant.toUpperCase());

const toAddress = (address: string, x: number, y: number): GeocodedAddress => ({
  label: `${tidy(address)}, Washington, DC`,
  lngLat: [x, y],
  street: address.replace(/^[\d-]+[A-Z]?\s+/, ''),
  borough: DC_BOROUGH,
  bbl: undefined,
});

// DC GIS answers about one request in five with a 503 at busy times, and the next try usually
// gets through.
const TRIES = 3;
const RETRY_PAUSE_MS = 500;

const getJson = async (url: string, signal?: AbortSignal): Promise<unknown> => {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { signal });
    if (res.ok) return res.json();
    if (res.status < 500 || attempt === TRIES)
      throw new Error(`DC geocoder returned ${res.status}`);
    await pause(RETRY_PAUSE_MS * attempt, signal);
  }
};

// The locator files no city, so "Washington, DC" and a ZIP only cost it score.
const withoutCity = (text: string) =>
  text.replace(/,?\s*(washington,?\s*)?d\.?c\.?(\s+\d{5})?\s*$/i, '');

export const geocodeDc = async (
  text: string,
  signal?: AbortSignal,
  magicKey?: string,
): Promise<GeocodedAddress> => {
  const query = new URLSearchParams({
    SingleLine: withoutCity(text),
    outSR: '4326',
    maxLocations: '1',
    f: 'json',
  });
  if (magicKey) query.set('magicKey', magicKey);
  const [match] = candidatesSchema.parse(
    await getJson(`${LOCATOR}/findAddressCandidates?${query}`, signal),
  ).candidates;
  if (!match || match.score < MIN_SCORE) throw new Error(`No DC address found for "${text}"`);
  return toAddress(match.address, match.location.x, match.location.y);
};

export const reverseGeocodeDc = async (
  [lng, lat]: [number, number],
  signal?: AbortSignal,
): Promise<GeocodedAddress> => {
  const query = new URLSearchParams({
    // A bare "x,y" is read as DC State Plane, so the point says it's in degrees.
    location: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    // Without this it answers with landmark names ("WHITE HOUSE") instead of addresses.
    featureTypes: 'PointAddress',
    distance: '150',
    outSR: '4326',
    f: 'json',
  });
  const found = reverseSchema.parse(await getJson(`${LOCATOR}/reverseGeocode?${query}`, signal));
  if (!found.address || !found.location) throw new Error('No DC address near that spot');
  return toAddress(found.address.Match_addr, found.location.x, found.location.y);
};

/** The locator's suggestions as rows: it knows only DC, so every one is in the city. */
export const parseDcSuggestions = (suggestions: LocatorSuggestion[]): AddressSuggestion[] =>
  suggestions.map(({ text, magicKey }) => ({
    line: text,
    place: 'Washington, DC',
    query: text,
    magicKey,
  }));

export const suggestDc = async (
  text: string,
  limit: number,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> =>
  parseDcSuggestions(await locatorSuggest(LOCATOR, withoutCity(text), { max: limit }, signal));
