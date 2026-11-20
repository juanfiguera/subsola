/**
 * Keeps a dated copy of Boston's and Cambridge's permits each night in a private R2 bucket, so
 * history builds up before either city is on the map. Nothing here is served: not on the map, the
 * MCP server or the site. See docs/archive.md.
 *
 *   pnpm archive-snapshots                reads R2_* from .env.r2 locally, or from the environment in CI
 *   pnpm archive-snapshots --out <dir>    writes <dir> instead of R2, for trying it locally
 *
 * It writes only to R2_ARCHIVE_BUCKET, never to the cells bucket, which data.subsola.com serves to
 * anyone. Without R2_ARCHIVE_BUCKET it writes nothing.
 */
import { z } from 'zod';
import { BOSTON_FIELDS, BOSTON_LAYERS, fetchBostonLayer, type BostonLayer } from './boston';
import { CAMBRIDGE_DATASET, CAMBRIDGE_FIELDS, fetchCambridge } from './cambridge';
import { encodeSnapshot, snapshotKey, sortRows, withheldCounts } from './snapshotFiles';
import { folderStore, outFolder, r2Store, type Store } from './store';

const PUBLIC_BUCKET_DEFAULT = 'backfill-cells';

const envSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1).default(PUBLIC_BUCKET_DEFAULT),
  R2_ARCHIVE_BUCKET: z.string().min(1),
});

interface Source {
  city: string;
  dataset: string;
  publisher: string;
  source: string | readonly string[];
  licence: string;
  fields: readonly string[];
  fetch: () => Promise<Record<string, unknown>[]>;
  /** What a row is keyed and sorted by, so consecutive nights diff line by line. */
  key: (row: Record<string, unknown>) => string;
}

const SOURCES: readonly Source[] = [
  {
    city: 'boston',
    dataset: 'street-permits',
    publisher: 'City of Boston, Public Works Department (Street Access Awareness)',
    source: Object.values(BOSTON_LAYERS),
    licence: 'Not stated on the layers; check before publishing anything built on them',
    fields: [...BOSTON_FIELDS, 'lon', 'lat'],
    fetch: async () => {
      const rows: Record<string, unknown>[] = [];
      for (const layer of Object.keys(BOSTON_LAYERS) as BostonLayer[]) {
        const layerRows = await fetchBostonLayer(layer);
        console.log(`  boston ${layer}: ${layerRows.length.toLocaleString()} permits`);
        rows.push(...layerRows);
      }
      return rows;
    },
    key: (row) => `${String(row.layer)}\t${String(row.permit_number)}`,
  },
  {
    city: 'cambridge',
    dataset: 'excavation-permits',
    publisher: 'City of Cambridge, Department of Public Works',
    source: CAMBRIDGE_DATASET,
    licence: 'Open Data Commons Public Domain Dedication and License (PDDL)',
    fields: CAMBRIDGE_FIELDS,
    fetch: fetchCambridge,
    key: (row) => String(row.id).padStart(12, '0'),
  },
];

const snapshotOne = async (store: Store, source: Source, today: string) => {
  const rows = await source.fetch();
  // An empty answer is an outage or a moved dataset, not a city with no permits.
  if (rows.length === 0) throw new Error(`${source.city} sent no rows; not writing`);
  const sorted = sortRows(rows, source.key);
  const bytes = encodeSnapshot(sorted);
  const key = snapshotKey(source.city, source.dataset, today);
  await store.write(key, bytes, 'application/gzip');
  const keys = new Set(sorted.map(source.key));
  const meta = {
    city: source.city,
    dataset: source.dataset,
    publisher: source.publisher,
    source: source.source,
    licence: source.licence,
    fields: source.fields,
    lastRun: today,
    lastKey: key,
    rows: sorted.length,
    duplicateKeys: sorted.length - keys.size,
    withheld: withheldCounts(sorted),
    bytes: bytes.length,
  };
  await store.write(
    snapshotKey(source.city, 'meta', null),
    new TextEncoder().encode(`${JSON.stringify(meta, null, 2)}\n`),
    'application/json',
  );
  console.log(
    `${source.city}: ${sorted.length.toLocaleString()} rows, ${(bytes.length / 1e6).toFixed(2)} MB -> ${key}`,
  );
};

/** The store to write to, or null when there is nowhere safe to write. */
const chooseStore = (): Store | null => {
  const out = outFolder(process.argv);
  if (out) return folderStore(out);
  // Checked before the credentials: an unset secret in CI arrives as an empty string.
  if (!process.env.R2_ARCHIVE_BUCKET?.trim()) {
    console.log('::warning::R2_ARCHIVE_BUCKET is not set; no Boston or Cambridge snapshot taken');
    return null;
  }
  const env = envSchema.parse(process.env);
  const bucket = env.R2_ARCHIVE_BUCKET.trim();
  // The cells bucket is public through data.subsola.com, so writing there would publish the
  // snapshots. Refused outright rather than trusting a prefix to stay unserved.
  if (bucket === env.R2_BUCKET || bucket === PUBLIC_BUCKET_DEFAULT)
    throw new Error(`R2_ARCHIVE_BUCKET is the public cells bucket (${bucket}); refusing to write`);
  return r2Store(env, bucket);
};

const main = async () => {
  const store = chooseStore();
  if (!store) return;
  const today = new Date().toISOString().slice(0, 10);
  // One city's outage never costs the other its night.
  for (const source of SOURCES) {
    try {
      await snapshotOne(store, source, today);
    } catch (error) {
      console.log(`::warning::${source.city} snapshot failed: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  }
};

await main();
