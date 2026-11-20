import { gzipSync } from 'node:zlib';

/**
 * Nightly snapshots, as opposed to Toronto's merged archive: each night's full pull is kept as its
 * own file. Both cities are small enough for that (a few MB a night between them), and a stack of
 * whole nights can rebuild any history later without trusting a merge written today.
 */

/** Keys live under snapshots/ in the private archive bucket. `date` null is the city's meta.json. */
export const snapshotKey = (city: string, dataset: string, date: string | null) =>
  date === null ? `snapshots/${city}/meta.json` : `snapshots/${city}/${dataset}/${date}.jsonl.gz`;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Rows in key order, ties broken by content, so the same pull always makes the same file. */
export const sortRows = (
  rows: readonly Record<string, unknown>[],
  key: (row: Record<string, unknown>) => string,
) =>
  rows
    .map((row) => ({ row, sortKey: key(row), line: JSON.stringify(row) }))
    .sort((a, b) => compare(a.sortKey, b.sortKey) || compare(a.line, b.line))
    .map(({ row }) => row);

/** Gzipped JSON Lines, one permit a line. */
export const encodeSnapshot = (rows: readonly Record<string, unknown>[]) =>
  gzipSync(rows.map((row) => `${JSON.stringify(row)}\n`).join(''));

const WITHHELD = '_withheld';

/** How many values of each company field were withheld, for meta.json. */
export const withheldCounts = (rows: readonly Record<string, unknown>[]) => {
  const counts: Record<string, number> = {};
  for (const row of rows)
    for (const [field, value] of Object.entries(row)) {
      if (!field.endsWith(WITHHELD) || value !== true) continue;
      const company = field.slice(0, -WITHHELD.length);
      counts[company] = (counts[company] ?? 0) + 1;
    }
  return counts;
};
