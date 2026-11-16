import { z } from 'zod';
import { columnsOf, fetchSocrata, soqlIn } from './socrata';
import { SOURCES } from './catalog';

/** One DEP permit for work on a lot's own water or sewer connection. */
export interface ConnectionPermit {
  utility: 'water' | 'sewer';
  /** "Connection", "Plug", "Repair", "Relay", "Service", "Tap" and so on, as DEP names it. */
  action: string;
  /** YYYY-MM-DD. */
  date: string;
  permitNumber: string;
  /** Which DEP dataset it came from: the current one covers 2021 on, the historic one 2018 to 2021. */
  dataset: 'current' | 'historic';
}

const BOROUGH_NAMES: Record<string, string> = {
  '1': 'Manhattan',
  '2': 'Bronx',
  '3': 'Brooklyn',
  '4': 'Queens',
  '5': 'Staten Island',
};

/** "4006520083" (borough, 5-digit block, 4-digit lot) into its parts. */
export const splitBbl = (bbl: string) => ({
  borough: bbl.slice(0, 1),
  block: bbl.slice(1, 6),
  lot: bbl.slice(6, 10),
});

export const currentConnectionSchema = z.object({
  propertyborough: z.string(),
  propertyblock: z.string(),
  propertylot: z.string().optional(),
  permitnumber: z.string(),
  issuancedate: z.string(),
  applicationtype: z.string(),
});

export const historicConnectionSchema = z.object({
  borough: z.string(),
  block: z.string(),
  lot: z.string().optional(),
  permit_no: z.string(),
  dateissued: z.string(),
  permit_description: z.string(),
});

export type CurrentConnectionRow = z.infer<typeof currentConnectionSchema>;
export type HistoricConnectionRow = z.infer<typeof historicConnectionSchema>;

const BOROUGH_CODES = new Map(
  Object.entries(BOROUGH_NAMES).map(([code, name]) => [name.toUpperCase(), code]),
);

/** "Sewer Connection" or "SEWER PERMIT-INSTALL" into a utility and a short action. */
export const parseConnectionType = (raw: string): Pick<ConnectionPermit, 'utility' | 'action'> => {
  const words = raw
    .replace(/permit-?/i, '')
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  const sewer = /sewer/i.test(raw);
  const action = words.filter((w) => !/^(sewer|water)$/i.test(w)).join(' ');
  return {
    utility: sewer ? 'sewer' : 'water',
    action: action ? action[0]!.toUpperCase() + action.slice(1).toLowerCase() : 'Permit',
  };
};

/** The lot a current permit is for, or null when DEP left the lot off. */
export const currentConnectionBbl = (row: CurrentConnectionRow): string | null => {
  const borough = BOROUGH_CODES.get(row.propertyborough.toUpperCase());
  return borough && row.propertylot
    ? `${borough}${row.propertyblock.padStart(5, '0')}${row.propertylot.padStart(4, '0')}`
    : null;
};

export const historicConnectionBbl = (row: HistoricConnectionRow): string | null =>
  row.lot ? `${row.borough}${row.block.padStart(5, '0')}${row.lot.padStart(4, '0')}` : null;

/**
 * Connection permits by BBL, newest first, one per permit and action. Only lots in `wanted` are
 * kept when it is given.
 */
export const connectionPermitsFromRows = (
  current: CurrentConnectionRow[],
  historic: HistoricConnectionRow[],
  wanted?: Set<string>,
): Map<string, ConnectionPermit[]> => {
  const permits = [
    ...current.flatMap((row) => {
      const bbl = currentConnectionBbl(row);
      return bbl
        ? [
            {
              bbl,
              date: row.issuancedate.slice(0, 10),
              permitNumber: row.permitnumber,
              dataset: 'current' as const,
              ...parseConnectionType(row.applicationtype),
            },
          ]
        : [];
    }),
    ...historic.flatMap((row) => {
      const bbl = historicConnectionBbl(row);
      return bbl
        ? [
            {
              bbl,
              date: row.dateissued.slice(0, 10),
              permitNumber: row.permit_no,
              dataset: 'historic' as const,
              ...parseConnectionType(row.permit_description),
            },
          ]
        : [];
    }),
  ];
  const byLot = new Map<string, ConnectionPermit[]>();
  const seen = new Set<string>();
  for (const { bbl, ...permit } of permits) {
    const key = `${bbl}|${permit.permitNumber}|${permit.utility}|${permit.action}`;
    if ((wanted && !wanted.has(bbl)) || seen.has(key)) continue;
    seen.add(key);
    byLot.set(bbl, [...(byLot.get(bbl) ?? []), permit]);
  }
  for (const list of byLot.values()) list.sort((a, b) => b.date.localeCompare(a.date));
  return byLot;
};

/**
 * Every connection permit on the blocks these lots sit on, keyed by BBL, newest first. DEP files
 * them by borough, block and lot with no location, so lots are the only way to place them.
 */
export const fetchConnectionPermits = async (
  bbls: string[],
  signal?: AbortSignal,
): Promise<Map<string, ConnectionPermit[]>> => {
  const blocks = [...new Set(bbls.map((bbl) => bbl.slice(0, 6)))].map(splitBbl);
  const byBorough = new Map<string, typeof blocks>();
  for (const block of blocks)
    byBorough.set(block.borough, [...(byBorough.get(block.borough) ?? []), block]);
  const inBoroughs = [...byBorough.entries()];
  const [current, historic] = await Promise.all([
    Promise.all(
      inBoroughs.map(([borough, inBorough]) =>
        fetchSocrata(
          SOURCES.connectionPermits.id,
          {
            where: `propertyborough=${soqlIn([BOROUGH_NAMES[borough] ?? ''])} AND propertyblock in (${soqlIn(inBorough.map((b) => b.block))})`,
            select: columnsOf(currentConnectionSchema),
          },
          currentConnectionSchema,
          signal,
        ),
      ),
    ),
    Promise.all(
      inBoroughs.map(([borough, inBorough]) =>
        fetchSocrata(
          SOURCES.connectionPermitsHistoric.id,
          {
            where: `borough=${soqlIn([borough])} AND block in (${soqlIn(inBorough.map((b) => String(Number(b.block))))})`,
            select: columnsOf(historicConnectionSchema),
          },
          historicConnectionSchema,
          signal,
        ),
      ),
    ),
  ]);
  return connectionPermitsFromRows(current.flat(), historic.flat(), new Set(bbls));
};

export type HouseSewerStatus =
  | { kind: 'on-record'; permit: ConnectionPermit }
  | { kind: 'plugged'; permit: ConnectionPermit }
  | { kind: 'assumed' };

// Catch basin and manhole permits are city drainage work, not the lot's own sewer.
const isHouseSewer = (permit: ConnectionPermit) =>
  permit.utility === 'sewer' && !/basin|man\b/i.test(permit.action);

/** What DEP's permits say about a lot's house sewer, from the newest one that applies. */
export const houseSewerStatus = (permits: ConnectionPermit[]): HouseSewerStatus => {
  const latest = permits.filter(isHouseSewer).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest) return { kind: 'assumed' };
  return /plug/i.test(latest.action)
    ? { kind: 'plugged', permit: latest }
    : { kind: 'on-record', permit: latest };
};
