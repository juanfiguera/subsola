import { REGIONS, cityNames, type RegionId } from '../../src/regions';
import { displayAddress } from './answers';
import type { AddressProblem } from './findAddress';

/**
 * What an assistant reads when an address isn't found: what went wrong, what the closest answer
 * was, and how to ask again. Plain enough to pass on to the person as is.
 */

const nameOf = (id: RegionId) => REGIONS.find((region) => region.id === id)?.name ?? id;
const namesOf = (ids: RegionId[]) =>
  new Intl.ListFormat('en', { type: 'disjunction' }).format(ids.map(nameOf));
const shown = (label: string) => displayAddress({ label });

const HOW_TO_FIX = `Give the house number, the street and the city or borough, as in "350 5th Ave, Manhattan" or "200 N Spring St, Los Angeles", or set the city input to search one city only.`;

const what = (problem: AddressProblem | null, typed: string): string => {
  if (!problem) return `Couldn't find "${typed}" in ${cityNames('or')}.`;
  switch (problem.kind) {
    case 'house-number':
      return `Couldn't find "${typed}". The closest match, ${shown(problem.found)}, has a different house number, so it isn't the address asked about. Check the house number, or name the city if the address is in another one.`;
    case 'street':
      return `Couldn't find "${typed}". The closest match, ${shown(problem.found)}, is on a different street.`;
    case 'wrong-city':
      return `Couldn't find "${typed}" in ${nameOf(problem.region)}. The only match, ${shown(problem.found)}, is outside the city.`;
    case 'other-state':
      return `"${typed}" names a state or ZIP code outside ${cityNames('and')}, which are the only places Subsola covers.`;
    case 'unknown-place':
      return `"${problem.place}" isn't one of the cities Subsola covers (${cityNames('and')}), so "${typed}" wasn't looked up elsewhere. If the address is in a covered city, name that city or borough instead.`;
    case 'other-city':
      return `"${problem.place}" is in ${namesOf(problem.regions)}, and no address matching "${typed}" was found there.`;
    case 'other-borough':
      return `Couldn't find "${typed}" in ${problem.place}. The only match was in ${problem.borough}, so it isn't the address asked about.`;
    case 'city-mismatch':
      return `"${problem.place}" is in ${namesOf(problem.regions)}, but the city input says ${nameOf(problem.city)}. Fix one or the other.`;
  }
};

export const missText = (problem: AddressProblem | null, typed: string) =>
  `${what(problem, typed)} ${HOW_TO_FIX}`;
