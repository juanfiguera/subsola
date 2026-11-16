import { streetMatchKey, streetsAgree } from '../../src/sources/streets';

/**
 * Whether the address a geocoder found is the one that was asked for. City geocoders return their
 * nearest guess with the same confidence as a real match ("100 Main St" came back as 190C Main St,
 * "200 N Spring St" as 200 Spring St in Manhattan), and an assistant can't see a map to notice.
 * So the house number has to be the same, the street has to agree, and a direction typed before
 * the street ("N", "West") has to be the found street's too.
 */

export interface HouseNumber {
  /** As typed, upper case and without spaces: "190C", "4512-14", "25-87". */
  text: string;
  /** The numbers it covers: one, or a range's ends. */
  first: number;
  last: number;
}

export interface AddressParts {
  number: HouseNumber | null;
  /** The street line after the number, before any comma. */
  street: string;
}

// "190", "190C", "190 1/2", "4512-14", "25-87": a number, a range or a Queens hyphenation, then
// an optional letter or half.
const NUMBER = /^\s*(\d+)(?:\s*-\s*(\d+))?(?:([A-Z])\b|\s+1\/2\b)?\s+(.*)$/i;

/** A range's end keeps the start's leading digits: "4512-14" is 4512 to 4514. */
const rangeEnd = (first: string, last: string) =>
  Number(first.slice(0, Math.max(0, first.length - last.length)) + last);

/**
 * The house number and street of an address's first line. "4512-14" is a range (Seattle writes
 * duplexes that way); in New York "25-87" is one Queens address, which `queens` says.
 */
export const addressParts = (text: string, { queens = false } = {}): AddressParts => {
  const line = text.split(',')[0]!.trim();
  const match = NUMBER.exec(line);
  if (!match) return { number: null, street: line };
  const [, start, end, letter, street] = match as unknown as [
    string,
    string,
    string | undefined,
    string | undefined,
    string,
  ];
  const typed = `${start}${end ? `-${end}` : ''}${letter ?? ''}`.toUpperCase();
  if (!end) return { number: { text: typed, first: Number(start), last: Number(start) }, street };
  // A Queens number is one house: 25-87 and 25-89 are neighbors, not a range.
  if (queens) {
    const house = Number(`${start}${end}`);
    return { number: { text: typed, first: house, last: house }, street };
  }
  const first = Number(start);
  const last = rangeEnd(start, end);
  // Not a range at all ("12-3"), or too long to be one building: only the first number counts.
  const isRange = last > first && last - first <= 40;
  return { number: { text: typed, first, last: isRange ? last : first }, street };
};

/** Whether two house numbers can be the same building: equal, or one inside the other's range. */
export const sameHouse = (asked: HouseNumber, found: HouseNumber): boolean =>
  asked.text === found.text || (asked.first <= found.last && found.first <= asked.last);

const DIRECTIONS: Record<string, string> = {
  N: 'N',
  NORTH: 'N',
  S: 'S',
  SOUTH: 'S',
  E: 'E',
  EAST: 'E',
  W: 'W',
  WEST: 'W',
};

/**
 * The direction a street name starts with, when more than a street type follows it: "N Spring
 * St" and "West 4th St" have one, "West St" and "East End Ave" do ("E", then "End Ave"), but
 * "West St" alone is a street named West.
 */
const leadingDirection = (street: string): string | null => {
  const words = street.toUpperCase().replace(/\./g, '').split(/\s+/).filter(Boolean);
  const direction = DIRECTIONS[words[0] ?? ''];
  return direction && words.length > 2 ? direction : null;
};

/** Whether the found street is the typed one. The typed text may run on into the city. */
export const sameStreet = (asked: string, found: string): boolean => {
  if (!streetsAgree(asked, found)) return false;
  const askedDirection = leadingDirection(asked);
  return !askedDirection || askedDirection === leadingDirection(found);
};

const comparable = (street: string) =>
  streetMatchKey(street.replace(/\b(\d+)(st|nd|rd|th)\b/gi, '$1')).replace(/[^A-Z0-9]/g, '');

export type MatchProblem = 'house-number' | 'street';

export interface MatchResult {
  problem: MatchProblem | null;
  /** Whether the found address reads differently from the typed one beyond spelling and case. */
  differs: boolean;
}

/**
 * Checks a found address's first line against the typed address. With no house number typed
 * there is nothing to hold the number to, but the answer then says what was matched.
 */
export const checkMatch = (
  typed: string,
  foundLabel: string,
  { queens = false } = {},
): MatchResult => {
  const asked = addressParts(typed, { queens });
  const found = addressParts(foundLabel, { queens });
  if (asked.number && !found.number) return { problem: 'house-number', differs: true };
  if (asked.number && found.number && !sameHouse(asked.number, found.number))
    return { problem: 'house-number', differs: true };
  if (!sameStreet(asked.street, found.street)) return { problem: 'street', differs: true };
  const askedKey = comparable(asked.street);
  const foundKey = comparable(found.street);
  // "200 N Spring St Los Angeles" typed without commas still names the found street first.
  const sameWords = askedKey === foundKey || askedKey.startsWith(foundKey);
  const differs = !asked.number || asked.number.text !== found.number?.text || !sameWords;
  return { problem: null, differs };
};
