export type Compass = 'N' | 'S' | 'E' | 'W';

/**
 * One measurement from a crew's location note: "4' WEC OF 37TH ST" is 4 ft west of the east
 * curb of 37th Street.
 */
export interface CurbOffset {
  feet: number;
  /** Which way the distance runs. */
  toward: Compass;
  /** Which of the street's two curbs it is measured from. */
  curb: Compass;
  /** The street as the crew wrote it; match with `streetKey`. */
  street: string;
}

// "<feet>' <toward><curb>C OF <street>", ending at "&", "AND", "(", a comma, "*" or the end.
const OFFSET =
  /(\d+(?:\.\d+)?)\s*(?:'|FT\.?|FEET)\s*([NSEW])([NSEW])C\s+OF\s+(.+?)(?=\s*(?:&|\bAND\b|\(|,|\*|$|\s-\s))/g;

export const parseLocationNote = (note: string): CurbOffset[] =>
  [...note.toUpperCase().matchAll(OFFSET)].map((match) => ({
    feet: Number(match[1]),
    toward: match[2] as Compass,
    curb: match[3] as Compass,
    street: match[4]!.trim(),
  }));

const SUFFIXES: Record<string, string> = {
  ST: 'STREET',
  STR: 'STREET',
  AVE: 'AVENUE',
  AV: 'AVENUE',
  BLVD: 'BOULEVARD',
  RD: 'ROAD',
  PL: 'PLACE',
  DR: 'DRIVE',
  LN: 'LANE',
  PKWY: 'PARKWAY',
  TER: 'TERRACE',
};

/**
 * One spelling per street, so a crew's "37TH ST" matches DOT's "37 STREET". A bare name like
 * "STEINWAY" keeps no suffix; `matchesStreet` lets it match "STEINWAY STREET".
 */
export const streetKey = (name: string) =>
  name
    .toUpperCase()
    .replace(/[.]/g, '')
    .replace(/\b(\d+)(ST|ND|RD|TH)\b/g, '$1')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => SUFFIXES[word] ?? word)
    .join(' ');

export const matchesStreet = (written: string, permitName: string) => {
  const [a, b] = [streetKey(written), streetKey(permitName)];
  return a === b || b.startsWith(`${a} `);
};
