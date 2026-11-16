import { REGIONS, regionAt, type Region, type RegionId } from '../../src/regions';
import type { GeocodedAddress } from '../../src/sources/geocode';
import { checkMatch, type MatchProblem } from './match';
import {
  citiesNamed,
  namedPlaces,
  knownPlace,
  placeProblem,
  type PlaceProblem,
} from './placeNames';

/**
 * Finds the address an assistant asked about, and only that address. The site's own search
 * (geocodeAnywhere in src/regions.ts) takes the first answer inside a city, because a person sees
 * where the map lands; an assistant can't, so here every answer is checked against what was typed
 * (house number, street, the city, borough or neighborhood named) and a city whose answer fails
 * is passed over for the next. When nothing passes, the miss says what the closest answer was
 * and why it didn't count, so the assistant can fix the question.
 */

export type AddressProblem =
  | PlaceProblem
  | { kind: MatchProblem; found: string; region: RegionId }
  | { kind: 'wrong-city'; found: string; region: RegionId }
  | { kind: 'city-mismatch'; place: string; regions: RegionId[]; city: RegionId };

export type FoundAddress =
  | {
      ok: true;
      address: GeocodedAddress;
      region: Region;
      /** Whether the match reads differently from what was typed, beyond spelling and case. */
      differs: boolean;
    }
  | { ok: false; reason: 'not-found'; problem: AddressProblem | null }
  | { ok: false; reason: 'timeout' };

export interface FindOptions {
  /** Ask only this city's geocoder. */
  city?: RegionId;
  signal?: AbortSignal;
  /** Which geocoder missed is worth logging; what was asked is not. */
  onMiss?: (region: Region) => void;
  regions?: Region[];
}

const isAbort = (error: unknown) =>
  error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');

/** The cities to ask, in order: the one named by `city`, those the text points to, then the rest. */
const regionsToAsk = (text: string, regions: Region[], city?: RegionId): Region[] => {
  if (city) return regions.filter((region) => region.id === city);
  const named = citiesNamed(text);
  // A named neighborhood or city settles which geocoders can answer at all.
  if (named) return regions.filter((region) => named.includes(region.id));
  const pointed = regions.filter((region) => region.says?.test(text));
  return [...pointed, ...regions.filter((region) => !pointed.includes(region))];
};

/** A place in the text that rules out the city the caller chose. */
const cityConflict = (text: string, city: RegionId): AddressProblem | null => {
  for (const place of namedPlaces(text)) {
    const known = knownPlace(place);
    if (known && !known.regions.includes(city))
      return { kind: 'city-mismatch', place, regions: known.regions, city };
  }
  return null;
};

export const findAddress = async (
  text: string,
  options: FindOptions = {},
): Promise<FoundAddress> => {
  const { city, signal, onMiss, regions = REGIONS } = options;
  if (city) {
    const conflict = cityConflict(text, city);
    if (conflict) return { ok: false, reason: 'not-found', problem: conflict };
  }
  const order = regionsToAsk(text, regions, city);
  if (!order.length) {
    // The places named belong to different cities ("Ballard, Los Angeles").
    const place = namedPlaces(text).find((name) => knownPlace(name));
    return {
      ok: false,
      reason: 'not-found',
      problem: place ? { kind: 'other-city', place, regions: knownPlace(place)!.regions } : null,
    };
  }
  let problem: AddressProblem | null = null;
  for (const region of order) {
    let address: GeocodedAddress;
    try {
      address = await region.geocode(text, signal);
    } catch (error) {
      if (signal?.aborted || isAbort(error)) return { ok: false, reason: 'timeout' };
      onMiss?.(region);
      continue;
    }
    // The NYC geocoder can fuzzy-match far afield; only answers inside the city count.
    if (regionAt(address.lngLat)?.id !== region.id) {
      problem ??= { kind: 'wrong-city', found: address.label, region: region.id };
      continue;
    }
    const place = placeProblem(text, region, address);
    if (place) {
      problem ??= place;
      continue;
    }
    // In New York "25-87" is one Queens address, not a range.
    const match = checkMatch(text, address.label, { queens: region.id === 'nyc' });
    if (match.problem) {
      problem ??= { kind: match.problem, found: address.label, region: region.id };
      continue;
    }
    return { ok: true, address, region, differs: match.differs };
  }
  // Nothing found at all: a place named outside the covered cities is the likeliest reason.
  const unknown = namedPlaces(text).find((name) => !knownPlace(name));
  if (!problem && unknown) problem = { kind: 'unknown-place', place: unknown };
  return { ok: false, reason: 'not-found', problem };
};
