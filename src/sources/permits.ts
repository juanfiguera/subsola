import { z } from 'zod';
import type { Feature, Geometry, Position } from 'geojson';
import { columnsOf, fetchSocrata, soqlIn } from './socrata';
import { SOURCES } from './catalog';
import { distanceMeters } from '../geo';
import { parseStateplaneWkt } from '../stateplane';
import { normalizeStreetName, type BlockLocator } from './streets';
import { scrubNames } from './names';
import type { UtilityKind } from '../utilities';
import { byPermitDayDesc, permitDay } from './permitDay';

export const permitSchema = z.object({
  permitnumber: z.string(),
  boroughname: z.string().optional(),
  permittypedesc: z.string().default(''),
  permitteename: z.string().default(''),
  permitissuedate: z.string().optional(),
  issuedworkstartdate: z.string().optional(),
  issuedworkenddate: z.string().optional(),
  onstreetname: z.string().optional(),
  fromstreetname: z.string().optional(),
  tostreetname: z.string().optional(),
  permitpurposecomments: z.string().optional(),
  permitlocationcomments: z.string().optional(),
  permitstatusshortdesc: z.string().optional(),
  /** New, Renew, Extend or Emergency: NYC files a renewal as its own permit and says so. */
  applicationtypeshortdesc: z.string().optional(),
  wkt: z.string().optional(),
});

export type PermitRow = z.infer<typeof permitSchema>;

export type PermitDataset =
  | 'permitsCurrent'
  | 'permitsHistoric'
  | 'dcPermits'
  | 'sfPermits'
  | 'laPermitsArchived'
  | 'sdPermits'
  | 'seaPermits'
  | 'denPermits'
  | 'chiPermits';

const TELECOM_COMPANIES =
  /VERIZON|EMPIRE CITY SUBWAY|TIME WARNER|CHARTER|SPECTRUM|CABLEVISION|ALTICE|RCN|LIGHTOWER|CROWN CASTLE|ZAYO|EXTENET|MOBILITIE|FIBERTECH|AT&T|T-MOBILE|NY SMSA|LIGHTPATH|NEXTG|CITYBRIDGE|ASTOUND/;

/**
 * Maps a permit to the utility it is evidence of, or null if it is not utility work
 * (dumpsters, sidewalk repair, crane placement, and so on).
 * Order matters: permit types like "REPAIR ELECTRIC/COMMUNICATIONS" are shared between
 * Con Edison and telecom carriers, so the permittee breaks the tie.
 */
export const classifyPermit = (type: string, permittee: string): UtilityKind | null => {
  const t = type.toUpperCase();
  const who = permittee.toUpperCase();
  if (/STEAM/.test(t)) return 'steam';
  if (/GAS/.test(t)) return 'gas';
  if (/SEWER|CATCH BASIN/.test(t)) return 'sewer';
  if (/WATER|HYDRANT/.test(t)) return 'water';
  if (/D\.D\.C\./.test(t)) return 'capital';
  const isTelecomType = /TELEPHONE|COMMUNICATION|CONDUIT|FIBER/.test(t);
  if (TELECOM_COMPANIES.test(who) && (isTelecomType || /MANHOLE|MAJOR INSTALL/.test(t)))
    return 'telecom';
  if (/VOLTAGE|ELECTRIC/.test(t)) return 'electric';
  // In NYC National Grid (filing as KeySpan or Brooklyn Union) runs gas only, so its manholes
  // are gas valve and regulator vaults.
  if (/CONDUIT|MANHOLE/.test(t) && /NATIONAL GRID|KEYSPAN|BROOKLYN UNION/.test(who)) return 'gas';
  if (/CONDUIT|MANHOLE/.test(t)) return /EDISON|PSEG/.test(who) ? 'electric' : 'telecom';
  if (/TELEPHONE|COMMUNICATION|FIBER/.test(t)) return 'telecom';
  return null;
};

// Narrows the query server-side; classifyPermit makes the final call.
export const UTILITY_TYPE_FILTER = [
  'GAS',
  'ELECTRIC',
  'VOLTAGE',
  'WATER',
  'SEWER',
  'CONDUIT',
  'TELEPHONE',
  'MANHOLE',
  'STEAM',
  'D.D.C.',
  'COMMUNICATION',
  'FIBER',
  'HYDRANT',
  'CATCH BASIN',
]
  .map((word) => `permittypedesc like '%${word}%'`)
  .join(' OR ');

export interface PermitRecord {
  permitNumber: string;
  utility: UtilityKind;
  type: string;
  permittee: string;
  /**
   * The day the city issued the permit, YYYY-MM-DD. Only a real issue or approval date: where a
   * city publishes none (Los Angeles, Denver) it is left out rather than filled with the work's
   * start, so read `permitDay` to sort or bucket permits by date.
   */
  issued?: string;
  /** The window the city allows the street to be open, as YYYY-MM-DD. */
  workStart: string | undefined;
  workEnd: string | undefined;
  status: string | undefined;
  street: string;
  purpose: string | undefined;
  /** Crew-written location, e.g. "0' NSC OF 28TH AVE & 4' WEC OF 37TH ST". Often the most precise clue available. */
  locationNote: string | undefined;
  mentionsMain: boolean;
  dataset: PermitDataset;
  /** The permit doesn't cut the street (opening a manhole, storing material); see NOT_OPENING. */
  noOpening?: true;
  /** The city filed it as a renewal or extension of an earlier permit (New York only). */
  renews?: 'renewal' | 'extension';
}

export interface PermitGroupProperties {
  /** The block and utility, so a block loaded twice (from overlapping areas) is kept once. */
  key: string;
  utility: UtilityKind;
  count: number;
  firstYear: number | null;
  lastYear: number | null;
  mainCount: number;
  permits: PermitRecord[];
  geometryKind: 'segment' | 'point';
}

/**
 * NYC permit types that don't cut the street: opening a manhole during a holiday embargo (a fifth
 * of all NYC utility permits), storing material, steam stacks and pay phones on the sidewalk.
 * Chicago's restorations repave a street another permit opened. They still show the utility is
 * there, so a block with nothing else keeps them, but they never count as digs.
 */
export const NOT_OPENING =
  /MANHOLE EMBARGO|STORAGE OF MATERIAL|STEAM STACKS|PUBLIC PAY TELEPHONE|^Restoration only/;

const describeStreet = (row: PermitRow) =>
  [row.onstreetname, [row.fromstreetname, row.tostreetname].filter(Boolean).join(' and ')]
    .filter(Boolean)
    .join(' between ');

// DOT stores some free text already HTML-encoded ("&amp;"); decode so it isn't escaped twice.
const decodeEntities = (text: string) =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');

// Crews type "jsmith @pepco.com" too. The domain must end in letters, so "PLA @ 4.5" stays.
const EMAIL = /[\w.+-]+ ?@ ?[A-Za-z][\w-]*(\.[\w-]+)*\.[A-Za-z]{2,}\b/g;
// US numbers as crews type them: 212-555-0100, (212) 555 0100, 202/388-2602, 202- 388 -2602,
// 2123882602. Area codes and exchanges never start with 0 or 1, which rules out most of the
// permit, contract and work order numbers in the same text. A bare ten digits can't follow a
// letter (pole "P2138169772") or a "number/" (a list like "816/840/936/1018 Chenery St"), but a
// separated number can follow a word or "#", because crews write "CALL AT202-379-8791".
const PHONE = new RegExp(
  [
    String.raw`(?<![\w#-]|\d/)(?:\+?1[\s./-])?`,
    String.raw`(?:\(?[2-9]\d{2}(?:\)[\s./-]{0,2}|[\s./-]{1,2})\s?[2-9]\d{2}[\s./-]{0,2}\d{4}|[2-9]\d{2}[2-9]\d{6})`,
    String.raw`(?!\w|-\d)`,
    '|',
    String.raw`(?<=[A-Za-z#-])\(?[2-9]\d{2}(?:\)[./-]?|[./-])\s?[2-9]\d{2}[\s./-]{0,2}\d{4}(?!\w|-\d)`,
  ].join(''),
  'g',
);

/** Free text crews typed, without the phone numbers, emails and names some of them typed into it. */
export const scrubContacts = (text: string) =>
  scrubNames(text.replace(EMAIL, '[email removed]').replace(PHONE, '[phone removed]'));

const cleanText = (text: string | undefined) => {
  const trimmed = text?.trim();
  return trimmed ? scrubContacts(decodeEntities(trimmed)) : undefined;
};

// Historic records put internal tracking codes in the purpose field ("00436A 012008090973890015A").
const isTrackingCode = (text: string) => /\d{15,}/.test(text) && !/[a-z]{4,}/i.test(text);

const RENEWS: Record<string, 'renewal' | 'extension'> = { renew: 'renewal', extend: 'extension' };

const toRecord = (row: PermitRow, utility: UtilityKind, dataset: PermitDataset): PermitRecord => {
  const purpose = cleanText(row.permitpurposecomments);
  const locationNote = cleanText(row.permitlocationcomments);
  const renews = RENEWS[row.applicationtypeshortdesc?.trim().toLowerCase() ?? ''];
  return {
    permitNumber: row.permitnumber,
    utility,
    type: row.permittypedesc,
    permittee: row.permitteename,
    issued: row.permitissuedate?.slice(0, 10),
    workStart: row.issuedworkstartdate?.slice(0, 10),
    workEnd: row.issuedworkenddate?.slice(0, 10),
    status: row.permitstatusshortdesc,
    street: describeStreet(row),
    purpose: purpose && !isTrackingCode(purpose) ? purpose : undefined,
    // "SUBMITTED AS: 37 ST 28 AVE" only restates the street names, so it is not a location clue.
    locationNote: locationNote && !/^SUBMITTED AS:/.test(locationNote) ? locationNote : undefined,
    mentionsMain: /\bMAIN\b/i.test(`${row.permitpurposecomments} ${row.permittypedesc}`),
    dataset,
    ...(NOT_OPENING.test(row.permittypedesc) && { noOpening: true }),
    ...(renews && { renews }),
  };
};

const yearOf = (record: PermitRecord) => {
  const day = permitDay(record);
  return day ? Number(day.slice(0, 4)) : null;
};

/**
 * Same block whichever way round the permit lists its cross streets. The borough is part of it
 * because the same names meet in more than one borough.
 */
const blockKey = (row: PermitRow) => {
  if (!row.onstreetname || (!row.fromstreetname && !row.tostreetname)) return null;
  const ends = [row.fromstreetname, row.tostreetname]
    .map((name) => (name ? normalizeStreetName(name) : ''))
    .sort();
  return [row.boroughname ?? '', normalizeStreetName(row.onstreetname), ...ends].join('|');
};

export interface DatasetRow {
  row: PermitRow;
  dataset: PermitDataset;
}

/**
 * Groups utility permits by block and utility so one block draws once per utility. Permits
 * without geometry (all of them since mid-2025) are placed with `locateBlock`; `keep` drops
 * blocks outside the area wanted.
 */
export const groupPermits = (
  rows: DatasetRow[],
  locateBlock: BlockLocator,
  keep: (geometry: Geometry) => boolean = () => true,
): Feature<Geometry, PermitGroupProperties>[] => {
  const groups = new Map<
    string,
    { geometry: Geometry; surveyed: boolean; records: PermitRecord[] }
  >();
  for (const { row, dataset } of rows) {
    const utility = classifyPermit(row.permittypedesc, row.permitteename);
    if (!utility) continue;
    const surveyed = parseStateplaneWkt(row.wkt);
    const geometry =
      surveyed ??
      (row.onstreetname && (row.fromstreetname || row.tostreetname)
        ? locateBlock(row.boroughname ?? '', row.onstreetname, row.fromstreetname, row.tostreetname)
        : null);
    if (!geometry || !keep(geometry)) continue;
    // A surveyed permit without street names is its own group; a shared fallback key would pile
    // every one of them into a single block.
    const key = `${utility}|${blockKey(row) ?? row.wkt ?? row.permitnumber}`;
    const group = groups.get(key) ?? { geometry, surveyed: Boolean(surveyed), records: [] };
    // DOT's own geometry beats one rebuilt from street names.
    if (surveyed && !group.surveyed) Object.assign(group, { geometry: surveyed, surveyed: true });
    group.records.push(toRecord(row, utility, dataset));
    groups.set(key, group);
  }

  return [...groups.entries()].map(([key, { geometry, records }]) =>
    permitGroupFeature(key, geometry, records),
  );
};

/**
 * One block's permits for one utility, newest first, as the app draws them. Permits that don't
 * open the street are kept only when the block has nothing else, and `count` is digs only.
 */
export const permitGroupFeature = (
  key: string,
  geometry: Geometry,
  allRecords: PermitRecord[],
): Feature<Geometry, PermitGroupProperties> => {
  const digs = allRecords.filter((record) => !record.noOpening);
  const records = digs.length ? digs : allRecords;
  records.sort(byPermitDayDesc);
  const years = records.map(yearOf).filter((year): year is number => year !== null);
  return {
    type: 'Feature',
    geometry,
    properties: {
      key,
      utility: records[0]!.utility,
      count: digs.length,
      firstYear: years.length ? Math.min(...years) : null,
      lastYear: years.length ? Math.max(...years) : null,
      mainCount: digs.filter((record) => record.mentionsMain).length,
      permits: records,
      geometryKind: geometry.type.includes('Line') ? 'segment' : 'point',
    },
  };
};

/** Utility permits on the given streets within `radiusMeters` of the address, grouped by block. */
export const fetchUtilityPermits = async (
  center: Position,
  borough: string,
  streetNames: string[],
  radiusMeters: number,
  locateBlock: BlockLocator,
  signal?: AbortSignal,
): Promise<Feature<Geometry, PermitGroupProperties>[]> => {
  if (!streetNames.length) return [];
  const names = soqlIn(streetNames);
  const where = [
    `boroughname = '${borough.toUpperCase()}'`,
    `onstreetname in (${names})`,
    `(fromstreetname in (${names}) OR tostreetname in (${names}) OR fromstreetname is null)`,
    `(${UTILITY_TYPE_FILTER})`,
  ].join(' AND ');

  const datasets: PermitDataset[] = ['permitsCurrent', 'permitsHistoric'];
  const results = await Promise.all(
    datasets.map((dataset) =>
      fetchSocrata(
        SOURCES[dataset].id,
        { where, select: columnsOf(permitSchema), limit: 50_000 },
        permitSchema,
        signal,
      ).then((rows) => rows.map((row) => ({ row, dataset }))),
    ),
  );
  return groupPermits(
    results.flat(),
    locateBlock,
    (geometry) => distanceMeters(center, geometry) <= radiusMeters,
  );
};
