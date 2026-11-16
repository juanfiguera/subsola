import { z } from 'zod';
import type { LineString, Point } from 'geojson';
import { columnsOf, fetchSocrata, intersectsBox, multiLineSchema } from './socrata';
import { SOURCES } from './catalog';

// CSCL abbreviates suffixes ("37 ST") while DOT permits spell them out ("37 STREET").
const SUFFIXES: Record<string, string> = {
  ST: 'STREET',
  AVE: 'AVENUE',
  AV: 'AVENUE',
  BLVD: 'BOULEVARD',
  RD: 'ROAD',
  PL: 'PLACE',
  DR: 'DRIVE',
  LN: 'LANE',
  CT: 'COURT',
  TER: 'TERRACE',
  PKWY: 'PARKWAY',
  EXPY: 'EXPRESSWAY',
  HWY: 'HIGHWAY',
  SQ: 'SQUARE',
  CRES: 'CRESCENT',
};

const PREFIXES: Record<string, string> = { N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST' };

export const toPermitStreetName = (cscl: string): string => {
  const words = cscl.toUpperCase().trim().split(/\s+/);
  const last = words.at(-1);
  if (last && SUFFIXES[last]) words[words.length - 1] = SUFFIXES[last]!;
  const first = words[0];
  if (words.length > 2 && first && PREFIXES[first]) words[0] = PREFIXES[first]!;
  return words.join(' ');
};

/** The columns asked of NYC's centerline dataset, so nothing here may be missing from it. */
export const streetRowSchema = z.object({
  full_street_name: z.string().optional(),
  boroughcode: z.string().optional(),
  the_geom: multiLineSchema.optional(),
});

/** A street from the build, which outside NYC names its region instead ("WASHINGTON"). */
export const builtStreetRowSchema = streetRowSchema.extend({ borough: z.string().optional() });

export type StreetRow = z.infer<typeof builtStreetRowSchema>;

// CSCL numbers boroughs; DOT permits name them.
const BOROUGH_BY_CODE: Record<string, string> = {
  '1': 'MANHATTAN',
  '2': 'BRONX',
  '3': 'BROOKLYN',
  '4': 'QUEENS',
  '5': 'STATEN ISLAND',
};

export interface StreetSegment {
  /** Display name as the city writes it, e.g. "37 ST". */
  label: string;
  /** DOT permit spelling, e.g. "37 STREET". */
  permitName: string;
  /** As DOT permits name it, e.g. "QUEENS". */
  borough: string;
  geometry: z.infer<typeof multiLineSchema>;
}

export const streetsFromRows = (rows: StreetRow[]): StreetSegment[] =>
  rows.flatMap((row) =>
    row.full_street_name && row.the_geom && row.full_street_name !== 'ALLEY'
      ? [
          {
            label: row.full_street_name,
            permitName: toPermitStreetName(row.full_street_name),
            borough: row.borough ?? BOROUGH_BY_CODE[row.boroughcode ?? ''] ?? '',
            geometry: row.the_geom,
          },
        ]
      : [],
  );

/** Every named street segment touching the area, with geometry for labels. */
export const fetchStreets = async (
  bbox: [number, number, number, number],
  signal?: AbortSignal,
): Promise<StreetSegment[]> =>
  streetsFromRows(
    await fetchSocrata(
      SOURCES.centerline.id,
      { select: columnsOf(streetRowSchema), where: intersectsBox('the_geom', bbox), limit: 1000 },
      streetRowSchema,
      signal,
    ),
  );

/** Permit text pads names with extra spaces ("WEST  105 STREET"); collapse them before comparing. */
export const normalizeStreetName = (name: string) => name.trim().replace(/\s+/g, ' ').toUpperCase();

/** Words written short on one side and long on the other, wherever they fall in the name. */
const WORDS: Record<string, string> = {
  ...SUFFIXES,
  AVE: 'AVENUE',
  PKY: 'PARKWAY',
  PY: 'PARKWAY',
  EXPWY: 'EXPRESSWAY',
  TPKE: 'TURNPIKE',
  TP: 'TURNPIKE',
  CONC: 'CONCOURSE',
  GRN: 'GREEN',
  FT: 'FORT',
  MT: 'MOUNT',
};

// The centerline names a street one way, permits another.
const ALIASES: Record<string, string> = {
  AVENUEOFTHEAMERICAS: '6AVENUE',
  SIXTHAVENUE: '6AVENUE',
};

/**
 * One spelling for matching a permit's street to the centerline, whichever side wrote it: every
 * abbreviation spelled out, directions at either end too, and no spaces, so "DE KALB AVENUE"
 * meets "DEKALB AVE" and "F D R DRIVE" meets "FDR DR". Both sides get the same treatment, so a
 * stretch like "AVENUE S" becoming "AVENUE SOUTH" still matches.
 */
export const streetMatchKey = (name: string): string => {
  const words = normalizeStreetName(name).split(' ');
  const last = words.length - 1;
  const key = words
    .map((word, i) => {
      // "ST" leads saints' names and ends streets.
      if (word === 'ST') return i === 0 && last > 0 ? 'SAINT' : 'STREET';
      if (PREFIXES[word] && last > 0 && (i === 0 || i === last)) return PREFIXES[word];
      return WORDS[word] ?? word;
    })
    .join('');
  return ALIASES[key] ?? key;
};

// Shorter than this, a typed street name is too little to say it means the found one.
const MIN_PARTIAL_KEY = 4;

// "37th" is how people type it and "37" how the city files it.
const withoutOrdinals = (name: string) => name.replace(/\b(\d+)(st|nd|rd|th)\b/gi, '$1');

/**
 * Whether a typed address's street is the street a geocoder found. Either may say more: "Main
 * Street Brooklyn" is MAIN STREET, and "Springfield" can be SPRINGFIELD BOULEVARD. A fallback
 * match to a different street altogether is not the address asked for.
 */
export const streetsAgree = (typed: string, found: string): boolean => {
  // "SAINT MARK'S PLACE" is St Marks Pl, and the city files Centre Street under both spellings.
  const keyOf = (name: string) =>
    streetMatchKey(withoutOrdinals(name))
      .replace(/[^A-Z0-9]/g, '')
      .replace(/CENTRE/g, 'CENTER');
  const asked = keyOf(typed);
  const got = keyOf(found);
  return asked.includes(got) || (asked.length >= MIN_PARTIAL_KEY && got.includes(asked));
};

/** An address as a house number and street key: "800 F STREET NW" and "800 F ST NW" agree. */
export const addressMatchKey = (address: string): string | null => {
  const match = address
    .trim()
    .toUpperCase()
    .match(/^(\d+[A-Z]?)\s+(.+)$/);
  return match ? `${match[1]} ${streetMatchKey(match[2]!)}` : null;
};

/**
 * Every address in a range as SPU writes one, "4512-14 SUNNYSIDE AVE N" for 4512 and 4514 on
 * the same side of the street, as match keys. Not for Queens, where "25-87 37 ST" is one address.
 */
export const addressRangeKeys = (address: string): string[] => {
  const match = address
    .trim()
    .toUpperCase()
    .match(/^(\d+)-(\d+)\s+(.+)$/);
  if (!match) {
    const key = addressMatchKey(address);
    return key ? [key] : [];
  }
  const [, first, last, street] = match as unknown as [string, string, string, string];
  // "4512-14": the end keeps the start's leading digits.
  const end = Number(first.slice(0, Math.max(0, first.length - last.length)) + last);
  const start = Number(first);
  if (!(end > start) || end - start > 40) return [addressMatchKey(`${first} ${street}`)!];
  const keys: string[] = [];
  for (let number = start; number <= end; number += 2)
    keys.push(addressMatchKey(`${number} ${street}`)!);
  return keys;
};

/**
 * The block between two cross streets as a line, or, when only one of them can be found (the
 * other missing, a "BEND" or "DEAD END", or named nowhere near), a point at that corner.
 */
export type BlockLocator = (
  borough: string,
  on: string,
  from: string | undefined,
  to: string | undefined,
) => LineString | Point | null;

// CSCL segments meet at shared nodes, so a real intersection has vertices within a few meters.
const NODE_TOLERANCE_M = 15;

const metersBetween = ([lng1, lat1]: number[], [lng2, lat2]: number[]) => {
  const dx = (lng2! - lng1!) * 111_320 * Math.cos((lat1! * Math.PI) / 180);
  const dy = (lat2! - lat1!) * 110_540;
  return Math.hypot(dx, dy);
};

/**
 * Since mid-2025 DOT publishes new permits without geometry, only street names. This rebuilds
 * the block from the centerline: the corner where the permit's street meets its "from" street,
 * to the corner where it meets its "to" street.
 */
export const blockLocator = (streets: StreetSegment[]): BlockLocator => {
  const vertices = new Map<string, number[][]>();
  for (const street of streets) {
    const name = `${street.borough}|${streetMatchKey(street.permitName)}`;
    const list = vertices.get(name) ?? [];
    list.push(...street.geometry.coordinates.flat());
    vertices.set(name, list);
  }

  // Citywide, the same corner comes up for every permit on the blocks either side of it.
  const corners = new Map<string, number[] | null>();
  const corner = (a: string, b: string): number[] | null => {
    const key = `${a}#${b}`;
    const known = corners.get(key);
    if (known !== undefined) return known;
    let best: { distance: number; point: number[] } | null = null;
    for (const p of vertices.get(a) ?? []) {
      for (const q of vertices.get(b) ?? []) {
        const distance = metersBetween(p, q);
        if (!best || distance < best.distance) best = { distance, point: p };
      }
    }
    const found = best && best.distance <= NODE_TOLERANCE_M ? best.point : null;
    corners.set(key, found);
    return found;
  };

  // Citywide, the same few thousand names come up millions of times.
  const keys = new Map<string, string>();
  const keyOf = (name: string) => {
    let key = keys.get(name);
    if (key === undefined) keys.set(name, (key = streetMatchKey(name)));
    return key;
  };

  return (borough, on, from, to) => {
    const named = (name: string) => `${borough.toUpperCase()}|${keyOf(name)}`;
    const street = named(on);
    const start = from ? corner(street, named(from)) : null;
    const end = to ? corner(street, named(to)) : null;
    if (start && end && metersBetween(start, end) >= 1)
      return { type: 'LineString', coordinates: [start, end] };
    const known = start ?? end;
    return known ? { type: 'Point', coordinates: known } : null;
  };
};
