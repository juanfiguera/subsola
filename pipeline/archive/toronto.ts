/**
 * Keeps a growing archive of Toronto's utility cut permits in R2. Toronto publishes a rolling window
 * of about 30 months and drops the oldest rows each week, so each night's copy is merged into what
 * the archive already holds rather than replacing it. See docs/archive.md.
 *
 *   pnpm archive-toronto                  reads R2_* from .env.r2 locally, or from the environment in CI
 *   pnpm archive-toronto --out <dir>      reads and writes <dir> instead of R2, for trying it locally
 */
import { z } from 'zod';
import { ARCHIVE_PREFIX } from '../r2';
import {
  decodeArchive,
  describeArchive,
  encodeArchive,
  mergeSnapshot,
  planSnapshots,
  type ArchivedRow,
} from './merge';
import { sourceRowSchema, toPermitRow, type PermitRow } from './permits';
import { folderStore, outFolder, r2Store, retrying } from './store';

const CKAN = 'https://ckan0.cf.opendata.inter.prod-toronto.ca';
const PACKAGE = 'utility-cut-permits';
const RESOURCE_ID = '2ed91301-a4d6-4082-9164-e82917b9e5fc';
// The datastore Toronto replaced in July 2026, left up but no longer refreshed. It still holds
// about 12,800 permits from early 2024 that the current window has already dropped, so a first run
// seeds the archive from it, dated the day it was last refreshed.
const RETIRED_RESOURCE_ID = 'ebdec599-4522-4473-b276-fa07d8638248';
// datastore_search allows 32,000; smaller pages keep each request short on a busy portal.
const PAGE_ROWS = 10_000;
const REQUEST_TIMEOUT_MS = 120_000;

const PREFIX = `${ARCHIVE_PREFIX}toronto/`;
const ARCHIVE_KEY = `${PREFIX}utility-cut-permits.jsonl.gz`;
const META_KEY = `${PREFIX}meta.json`;
const SNAPSHOT_PREFIX = `${PREFIX}snapshots/`;
const CACHE = 'public, max-age=3600';

const LICENCE = 'Open Government Licence – Toronto';
const ATTRIBUTION = `Contains information licensed under the ${LICENCE}`;

const ckanResponseSchema = z.object({ success: z.literal(true), result: z.unknown() });

const ckan = async <T extends z.ZodType>(
  action: string,
  params: Record<string, string>,
  result: T,
): Promise<z.infer<T>> => {
  const url = `${CKAN}/api/3/action/${action}?${new URLSearchParams(params)}`;
  const res = await retrying(action, () =>
    fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  );
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return result.parse(ckanResponseSchema.parse(await res.json()).result);
};

const pageSchema = z.object({ total: z.number(), records: z.array(z.unknown()) });

/** Every row of a datastore resource, cleaned. Throws unless it got exactly the rows promised. */
const fetchResource = async (resourceId: string): Promise<PermitRow[]> => {
  const rows: PermitRow[] = [];
  let total: number | undefined;
  for (let offset = 0; total === undefined || offset < total; offset += PAGE_ROWS) {
    const page = await ckan(
      'datastore_search',
      { resource_id: resourceId, limit: String(PAGE_ROWS), offset: String(offset), sort: '_id' },
      pageSchema,
    );
    // A weekly refresh landing mid-run would shift the offsets under us.
    if (total !== undefined && page.total !== total)
      throw new Error(`${resourceId} went from ${total} to ${page.total} rows mid-run`);
    total = page.total;
    for (const record of page.records) rows.push(toPermitRow(sourceRowSchema.parse(record)));
    if (page.records.length === 0) break;
  }
  if (rows.length !== total)
    throw new Error(`${resourceId} promised ${total} rows and sent ${rows.length}`);
  const permits = new Set(rows.map((row) => row.permit));
  if (permits.size !== rows.length)
    throw new Error(`${resourceId} lists ${rows.length - permits.size} permit numbers twice`);
  return rows;
};

const envSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1).default('backfill-cells'),
});

const bucketStore = () => {
  const env = envSchema.parse(process.env);
  return r2Store(env, env.R2_BUCKET, CACHE);
};

const retiredSnapshot = async (): Promise<{ rows: PermitRow[]; seenOn: string } | null> => {
  try {
    const resource = await ckan(
      'resource_show',
      { id: RETIRED_RESOURCE_ID },
      z.object({ datastore_active: z.boolean(), last_modified: z.string().nullable() }),
    );
    if (!resource.datastore_active || !resource.last_modified) return null;
    return {
      rows: await fetchResource(RETIRED_RESOURCE_ID),
      seenOn: resource.last_modified.slice(0, 10),
    };
  } catch (error) {
    console.warn(`Skipping the retired resource: ${(error as Error).message}`);
    return null;
  }
};

const main = async () => {
  const out = outFolder(process.argv);
  const store = out ? folderStore(out) : bucketStore();
  const today = new Date().toISOString().slice(0, 10);

  const pkg = await ckan(
    'package_show',
    { id: PACKAGE },
    z.object({ last_refreshed: z.string().nullable().optional() }),
  );
  const current = await fetchResource(RESOURCE_ID);
  console.log(`${current.length.toLocaleString()} permits in Toronto's current window`);

  // A missing archive starts a new one; an archive that can't be read stops the run, since
  // carrying on would overwrite the history with a single night.
  const existingBytes = await store.read(ARCHIVE_KEY);
  let archive: ArchivedRow[] = existingBytes ? decodeArchive(existingBytes) : [];
  if (!existingBytes) {
    if (await store.read(META_KEY))
      throw new Error(`${META_KEY} exists but ${ARCHIVE_KEY} doesn't; not starting over`);
    console.log('No archive yet; starting one');
    const retired = await retiredSnapshot();
    if (retired) {
      archive = mergeSnapshot(archive, retired.rows, retired.seenOn);
      console.log(
        `Seeded ${retired.rows.length.toLocaleString()} permits from the retired resource (${retired.seenOn})`,
      );
    }
  }

  const merged = mergeSnapshot(archive, current, today);
  const mergedPermits = new Set(merged.map((row) => row.permit));
  const lost = archive.filter((row) => !mergedPermits.has(row.permit)).length;
  if (lost > 0) throw new Error(`The merge lost ${lost} permits; not writing`);

  if (existingBytes) {
    const snapshots = planSnapshots(await store.list(SNAPSHOT_PREFIX), SNAPSHOT_PREFIX, today);
    if (snapshots.take) {
      await store.write(snapshots.take, existingBytes, 'application/gzip');
      console.log(`Kept last night's archive as ${snapshots.take}`);
    }
    for (const key of snapshots.remove) await store.remove(key);
  }

  const bytes = encodeArchive(merged);
  const summary = describeArchive(merged, today);
  const meta = {
    dataset: 'Utility Cut Permits',
    publisher: 'City of Toronto, Transportation Services',
    source: `${CKAN}/dataset/${PACKAGE}`,
    resourceId: RESOURCE_ID,
    sourceRefreshed: pkg.last_refreshed ?? null,
    licence: LICENCE,
    licenceUrl: 'https://open.toronto.ca/open-data-licence/',
    attribution: ATTRIBUTION,
    ...summary,
    archiveKey: ARCHIVE_KEY,
    archiveBytes: bytes.length,
  };
  await store.write(ARCHIVE_KEY, bytes, 'application/gzip');
  await store.write(
    META_KEY,
    new TextEncoder().encode(`${JSON.stringify(meta, null, 2)}\n`),
    'application/json',
  );
  const added = merged.length - archive.length;
  console.log(
    `Archive: ${merged.length.toLocaleString()} permits (${added.toLocaleString()} new, ` +
      `${summary.droppedFromSource.toLocaleString()} no longer in the source), ` +
      `${(bytes.length / 1e6).toFixed(1)} MB; proposed starts ${summary.proposedFrom.oldest} to ${summary.proposedFrom.newest}`,
  );
};

await main();
