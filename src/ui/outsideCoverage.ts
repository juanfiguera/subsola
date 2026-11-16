import { REGIONS, type Region } from '../regions';
import type { GeocodedAddress } from '../sources/geocode';
import { knownPlace, namedPlaces, placeProblem } from '../../server/mcp/placeNames';
import { namesAnotherPlace } from '../../server/mcp/places';
import type { CoverageMiss } from './coverage';

/**
 * Whether a typed address is somewhere Subsola doesn't cover, by the same place checks the MCP
 * server makes. New York's geocoder answers almost anything with some New York address ("1 Main
 * St, Boston" came back as a Brooklyn one), and landing there would look like an answer. Only
 * places outside the cities count here: the site shows where a search landed, so a near miss
 * inside a city (another borough, another house number) is left to the eye.
 *
 * `found` is what a geocoder answered, or null when none did.
 */
export const outsideCoverage = (
  typed: string,
  found: { address: GeocodedAddress; region: Region } | null,
): CoverageMiss | null => {
  if (found) {
    const problem = placeProblem(typed, found.region, found.address);
    if (problem?.kind === 'other-state') return { kind: 'other-state', typed };
    if (problem?.kind === 'unknown-place')
      return { kind: 'unknown-place', typed, place: problem.place };
    return null;
  }
  const unknown = namedPlaces(typed).find((place) => !knownPlace(place));
  if (unknown) return { kind: 'unknown-place', typed, place: unknown };
  if (REGIONS.every((region) => namesAnotherPlace(typed, region)))
    return { kind: 'other-state', typed };
  return null;
};
