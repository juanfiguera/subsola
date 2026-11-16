import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { z } from 'zod';
import type { DatasetSpec } from './datasets';
import { dataDir } from './paths';
import { isPaused } from '../src/sources/catalog';
import { onlyCity } from './city';
import { CITY_DATASETS } from './datasets';

export interface RowCounts {
  read: number;
  rejected: number;
}

/**
 * Every downloaded row of a dataset, page by page, checked against the schema the app uses. A row
 * the app would reject is counted and skipped rather than failing the whole page.
 */
export async function* readRows<S extends z.ZodObject>(
  spec: DatasetSpec & { schema: S },
  counts: RowCounts = { read: 0, rejected: 0 },
): AsyncGenerator<z.infer<S>> {
  // A one-city build (CITY=sea) reads no other city's datasets; they weren't downloaded.
  if (onlyCity && !CITY_DATASETS[onlyCity].some((wanted) => wanted.name === spec.name)) return;
  // Paused for its terms (PAUSED_SOURCES): built without, even from pages left on disk.
  if (isPaused(spec.name)) {
    console.warn(`${spec.name}: paused, built without it`);
    return;
  }
  const dir = join(dataDir, 'raw', spec.name);
  const pages = existsSync(dir)
    ? (await readdir(dir)).filter((file) => file.endsWith('.json.gz')).sort()
    : [];
  if (!pages.length) {
    // A layer whose server was down tonight is built without; see `optional` in datasets.ts.
    if (spec.optional) {
      console.warn(`${spec.name}: not downloaded, built without it`);
      return;
    }
    throw new Error(`No pages for ${spec.name} in ${dir}; run pnpm download`);
  }
  for (const page of pages) {
    const rows = JSON.parse(gunzipSync(await readFile(join(dir, page))).toString()) as unknown[];
    for (const raw of rows) {
      counts.read += 1;
      const parsed = spec.schema.safeParse(raw);
      if (parsed.success) yield parsed.data;
      else counts.rejected += 1;
    }
  }
}
