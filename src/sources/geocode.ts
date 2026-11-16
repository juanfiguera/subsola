import { z } from 'zod';
import { streetsAgree } from './streets';

const featureSchema = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z.object({
    label: z.string(),
    street: z.string().optional(),
    borough: z.string().optional(),
    addendum: z.object({ pad: z.object({ bbl: z.string().optional() }).optional() }).optional(),
  }),
});

const responseSchema = z.object({ features: z.array(featureSchema) });

export interface GeocodedAddress {
  label: string;
  lngLat: [number, number];
  /** Upper-case street name as DOT spells it, e.g. "37 STREET". */
  street: string | undefined;
  borough: string;
  bbl: string | undefined;
}

const GEOSEARCH = 'https://geosearch.planninglabs.nyc/v2';

// A typed street address: a house number, then the street.
const STREET_ADDRESS = /^\s*\d[\d-]*[A-Z]?\s+([^,]+)/i;

// GeoSearch falls back to any address it can, rated the same as a real match ("99999 Nowhere
// Blvd" came back as 99999 Springfield Boulevard, "1 Centre St" as a school in Jamaica), so a
// typed street address takes the first of a few candidates on the street it names.
const CANDIDATES = 5;

/** The best GeoSearch match, or an error that says why there isn't one. */
const firstAddress = async (url: string, asked: string, signal?: AbortSignal, typed?: string) => {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Geocoder returned ${res.status}`);
  const typedStreet = typed?.match(STREET_ADDRESS)?.[1];
  const match = responseSchema
    .parse(await res.json())
    .features.find(
      ({ properties }) =>
        !typedStreet || !properties.street || streetsAgree(typedStreet, properties.street),
    );
  if (!match) throw new Error(`No NYC address found for "${asked}"`);
  if (!match.properties.borough) throw new Error(`"${match.properties.label}" is outside NYC`);

  return {
    label: match.properties.label.replace(/, USA$/, ''),
    lngLat: match.geometry.coordinates,
    street: match.properties.street?.toUpperCase(),
    borough: match.properties.borough,
    bbl: match.properties.addendum?.pad?.bbl,
  } satisfies GeocodedAddress;
};

/** NYC Planning Labs GeoSearch, backed by the city's PAD address database. No key required. */
export const geocode = (text: string, signal?: AbortSignal): Promise<GeocodedAddress> =>
  firstAddress(
    `${GEOSEARCH}/search?size=${CANDIDATES}&text=${encodeURIComponent(text)}`,
    `"${text}"`,
    signal,
    text,
  );

/** The address nearest a point, for loading wherever the city map was zoomed in. */
export const reverseGeocode = (
  [lng, lat]: [number, number],
  signal?: AbortSignal,
): Promise<GeocodedAddress> =>
  firstAddress(
    `${GEOSEARCH}/reverse?size=1&point.lat=${lat}&point.lon=${lng}`,
    'near that spot',
    signal,
  );
