import { gunzipSync, gzipSync } from 'node:zlib';
import { z } from 'zod';
import { permitRowSchema, type PermitRow } from './permits';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const archivedRowSchema = permitRowSchema.extend({
  /** The first night this archive saw the permit in the source. */
  firstSeen: day,
  /** The last night it was there; older than the last run once it dropped out of the window. */
  lastSeen: day,
});
export type ArchivedRow = z.infer<typeof archivedRowSchema>;

const byPermit = (a: ArchivedRow, b: ArchivedRow) =>
  a.permit < b.permit ? -1 : a.permit > b.permit ? 1 : 0;

/**
 * Folds one snapshot of the source into the archive. A permit in the snapshot takes the snapshot's
 * fields and is marked seen on `seenOn`; a permit the snapshot no longer has stays exactly as it
 * was last seen, since the source drops old rows and those are what the archive is for. A snapshot
 * older than a row's last sighting never overwrites it.
 */
export const mergeSnapshot = (
  archive: readonly ArchivedRow[],
  snapshot: readonly PermitRow[],
  seenOn: string,
): ArchivedRow[] => {
  const rows = new Map(archive.map((row) => [row.permit, row]));
  for (const row of snapshot) {
    const previous = rows.get(row.permit);
    const firstSeen = previous && previous.firstSeen < seenOn ? previous.firstSeen : seenOn;
    if (previous && previous.lastSeen > seenOn) rows.set(row.permit, { ...previous, firstSeen });
    else rows.set(row.permit, { ...row, firstSeen, lastSeen: seenOn });
  }
  return [...rows.values()].sort(byPermit);
};

/** Gzipped JSON Lines, one permit a line, in permit order so a night's file diffs cleanly. */
export const encodeArchive = (rows: readonly ArchivedRow[]) =>
  gzipSync(rows.map((row) => `${JSON.stringify(row)}\n`).join(''));

/** Throws on a row that doesn't parse, so a damaged archive is never merged into and rewritten. */
export const decodeArchive = (bytes: Uint8Array): ArchivedRow[] =>
  gunzipSync(bytes)
    .toString('utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const parsed = archivedRowSchema.safeParse(JSON.parse(line));
      if (!parsed.success)
        throw new Error(`Archive line ${index + 1} is not a permit: ${parsed.error.message}`);
      return parsed.data;
    });

const extent = (values: Iterable<string>) => {
  let oldest: string | null = null;
  let newest: string | null = null;
  for (const value of values) {
    if (oldest === null || value < oldest) oldest = value;
    if (newest === null || value > newest) newest = value;
  }
  return { oldest, newest };
};

/** Counts and date ranges for meta.json. */
export const describeArchive = (rows: readonly ArchivedRow[], lastRun: string) => {
  const inSource = rows.filter((row) => row.lastSeen === lastRun).length;
  // Typed years like 9960 and 2519 turn up in the proposed dates; past five years out is a typo.
  const latestPlausible = `${Number(lastRun.slice(0, 4)) + 5}${lastRun.slice(4)}`;
  const starts = rows
    .map((row) => row.from)
    .filter((from): from is string => from !== null && day.safeParse(from).success)
    .filter((from) => from <= latestPlausible);
  return {
    rows: rows.length,
    inSource,
    droppedFromSource: rows.length - inSource,
    proposedFrom: extent(starts),
    firstSeen: extent(rows.map((row) => row.firstSeen)).oldest,
    lastRun,
  };
};

const SNAPSHOT_EVERY_DAYS = 7;
const SNAPSHOTS_KEPT = 8;
const DAY_MS = 86_400_000;

/**
 * Whether tonight takes a weekly copy of the archive as it stood before the merge, and which old
 * copies go. Taken when the newest copy is a week old rather than on a set weekday, so a failed
 * night only delays it. Eight copies cover two months of nights for a bad merge to be noticed.
 */
export const planSnapshots = (keys: readonly string[], prefix: string, today: string) => {
  const dates = keys
    .map((key) => /^(\d{4}-\d{2}-\d{2})\.jsonl\.gz$/.exec(key.slice(prefix.length))?.[1])
    .filter((date): date is string => date !== undefined)
    .sort();
  const newest = dates.at(-1);
  const take =
    newest === undefined || Date.parse(today) - Date.parse(newest) >= SNAPSHOT_EVERY_DAYS * DAY_MS;
  const kept = take ? [...dates, today] : dates;
  return {
    take: take ? `${prefix}${today}.jsonl.gz` : null,
    remove: kept.slice(0, -SNAPSHOTS_KEPT).map((date) => `${prefix}${date}.jsonl.gz`),
  };
};
