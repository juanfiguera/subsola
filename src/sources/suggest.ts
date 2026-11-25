import { NYC, REGIONS, type Region } from '../regions';
import type { AddressIndex } from './addressIndex';
import type { AddressSuggestion } from './geocode';

/** A row of the search box's type-ahead and the city whose lookup gave it. */
export interface CitySuggestion extends AddressSuggestion {
  region: Region;
}

/** Rows shown under the search box at most. */
export const SUGGESTION_LIMIT = 6;

// New York's region names no words of its own (geocodeAnywhere tries it first anyway), so the
// type-ahead keeps its own: the city and its boroughs, and its ZIPs (100xx to 104xx, 110xx to
// 116xx).
const SAYS_NEW_YORK =
  /new york|\bnyc\b|manhattan|brooklyn|queens|bronx|staten island|\b1(0[0-4]|1[0-6])\d\d\b/i;

const says = (region: Region) => (region === NYC ? SAYS_NEW_YORK : region.says);

/**
 * Which cities' lookups to ask for what's typed so far. Asking all ten on every keystroke would
 * send a half-typed address to servers that can't know it and multiply the load on public
 * services, so at most two are asked:
 *
 * - After a comma, the text names its city (", Dallas", ", DC 20004"): only the cities it names.
 * - Otherwise the city on the map, since that's where most people search next, and New York,
 *   which gets most visits. A city named without a comma ("800 F St NW") takes New York's place:
 *   its words could also be a street ("233 Washington St"), so the city on the map stays in.
 *
 * The house number is set aside first, so "20012 ..." isn't read as DC's ZIP.
 */
/** The cities named after a comma (", Dallas", ", DC 20004"), if any. */
const namedAfterComma = (text: string): Region[] => {
  const comma = text.indexOf(',');
  if (comma < 0) return [];
  const place = text.slice(comma + 1);
  return REGIONS.filter((region) => says(region)?.test(place));
};

export const citiesToAsk = (text: string, current: Region | null): Region[] => {
  const here = current ?? NYC;
  const named = namedAfterComma(text);
  if (named.length) return named.slice(0, 2);
  const street = text.replace(/^\s*\d[\d-]*[A-Z]?\s+/i, '');
  const inStreet = REGIONS.find((region) => region !== here && says(region)?.test(street));
  return [...new Set([here, inStreet ?? NYC])];
};

/**
 * Each city's rows in turn, up to `limit`: every city gets its share first, so the city on the map
 * can't crowd out New York's one good match, and spare places go to whoever has more.
 */
export const mergeSuggestions = (lists: CitySuggestion[][], limit: number): CitySuggestion[] => {
  const share = Math.floor(limit / Math.max(lists.length, 1));
  const taken = lists.map((list) => Math.min(list.length, share));
  let spare = limit - taken.reduce((sum, count) => sum + count, 0);
  lists.forEach((list, i) => {
    const more = Math.min(list.length - taken[i]!, spare);
    taken[i]! += more;
    spare -= more;
  });
  return lists.flatMap((list, i) => list.slice(0, taken[i]));
};

/**
 * What's typed before the first comma. The rest names the city, which has already picked whose
 * lookup to ask, and LA's and King County's suggest find nothing for a half-typed street with
 * the city after it ("200 N Spr, Los Angeles"), though they find the street alone.
 */
export const streetPart = (text: string) => {
  const comma = text.indexOf(',');
  return comma >= 0 ? text.slice(0, comma).trim() : text;
};

/**
 * What to hand the city's geocoder for an address from the index. New York's needs the borough,
 * since "233 Broadway" alone could be Brooklyn's; the others read the line back as typed.
 */
export const indexQuery = (region: Region, line: string, place: string) =>
  region === NYC ? `${line}, ${place}` : line;

// The index holds street addresses, which start with a house number; a landmark or a corner
// ("Times Square", "Broadway and 42nd") still needs the city's lookup.
const STARTS_WITH_NUMBER = /^\s*\d/;

/**
 * Suggestions for what's typed so far, from the cities `citiesToAsk` picks, in parallel. A street
 * address comes from Subsola's own index, so nothing typed leaves the page; a city without one
 * tonight, or anything that isn't a street address, asks the city's own lookup. A city that fails
 * just has no rows: type-ahead is a help, never in the way. What was typed is never logged.
 */
export const suggestAddresses = async (
  text: string,
  current: Region | null,
  signal?: AbortSignal,
  limit: number = SUGGESTION_LIMIT,
  index?: AddressIndex,
): Promise<CitySuggestion[]> => {
  const asked = citiesToAsk(text, current);
  const street = streetPart(text);
  const indexed = index && STARTS_WITH_NUMBER.test(street);
  // Searching the index sends nothing anywhere, so a street address is looked for in every city,
  // the chosen ones first: "233 S Wacker" finds Chicago from the New York map. A city named after
  // a comma still narrows it to that city.
  const regions =
    indexed && !namedAfterComma(text).length ? [...new Set([...asked, ...REGIONS])] : asked;
  const lists = await Promise.all(
    regions.map(async (region) => {
      try {
        const fromIndex = indexed ? await index.lookup(region.id, street, limit) : null;
        if (fromIndex)
          return fromIndex.map((row) => ({
            ...row,
            query: indexQuery(region, row.line, row.place),
            region,
          }));
        // Only the chosen cities' own lookups are asked; the rest are reached through the index.
        if (!asked.includes(region)) return [];
        const rows = await region.suggest(street, limit, signal);
        return rows.map((row) => ({ ...row, region }));
      } catch (error) {
        if (!signal?.aborted)
          console.info(
            `[subsola] ${region.short} suggestions failed: ${error instanceof Error ? error.name : 'error'}`,
          );
        return [];
      }
    }),
  );
  return mergeSuggestions(lists, limit);
};
