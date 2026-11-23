import { NYC, REGIONS, type Region } from '../regions';
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
export const citiesToAsk = (text: string, current: Region | null): Region[] => {
  const here = current ?? NYC;
  const comma = text.indexOf(',');
  if (comma >= 0) {
    const place = text.slice(comma + 1);
    const named = REGIONS.filter((region) => says(region)?.test(place));
    if (named.length) return named.slice(0, 2);
  }
  const street = text.replace(/^\s*\d[\d-]*[A-Z]?\s+/i, '');
  const named = REGIONS.find((region) => region !== here && says(region)?.test(street));
  return [...new Set([here, named ?? NYC])];
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
 * Suggestions for what's typed so far, from the cities `citiesToAsk` picks, in parallel. A city
 * that fails just has no rows: type-ahead is a help, never in the way. What was typed is never
 * logged.
 */
export const suggestAddresses = async (
  text: string,
  current: Region | null,
  signal?: AbortSignal,
  limit: number = SUGGESTION_LIMIT,
): Promise<CitySuggestion[]> => {
  const regions = citiesToAsk(text, current);
  const street = streetPart(text);
  const lists = await Promise.all(
    regions.map(async (region) => {
      try {
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
