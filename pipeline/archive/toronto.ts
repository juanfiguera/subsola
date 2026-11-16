/**
 * Keeps a growing archive of Toronto's utility cut permits in R2. Toronto publishes a rolling window
 * of about 30 months and drops the oldest rows each week, so each night's copy is merged into what
 * the archive already holds rather than replacing it. See docs/archive.md.
 *
 *   pnpm archive-toronto                  reads R2_* from .env.r2 locally, or from the environment in CI
 *   pnpm archive-toronto --out <dir>      reads and writes <dir> instead of R2, for trying it locally
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AwsClient } from 'aws4fetch';
import { z } from 'zod';
import { ARCHIVE_PREFIX, parseListing } from '../r2';
import {
  decodeArchive,
  describeArchive,
  encodeArchive,
  mergeSnapshot,
  planSnapshots,
  type ArchivedRow,
} from './merge';
import { sourceRowSchema, toPermitRow, type PermitRow } from './permits';

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
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];

const PREFIX = `${ARCHIVE_PREFIX}toronto/`;
const ARCHIVE_KEY = `${PREFIX}utility-cut-permits.jsonl.gz`;
const META_KEY = `${PREFIX}meta.json`;
const SNAPSHOT_PREFIX = `${PREFIX}snapshots/`;
const CACHE = 'public, max-age=3600';

const LICENCE = 'Open Government Licence – Toronto';
const ATTRIBUTION = `Contains information licensed under the ${LICENCE}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Network errors, timeouts and 5xx are retried; anything else is a real answer and isn't. */
const retrying = async (label: string, attempt: () => Promise<Response>) => {
  for (let tries = 0; ; tries++) {
    const delay = RETRY_DELAYS_MS[tries];
    let reason: string;
    try {
      const res = await attempt();
      if (res.ok || (res.status < 500 && res.status !== 429)) return res;
      reason = `HTTP ${res.status}`;
    } catch (error) {
      if (!(error instanceof TypeError) && !(error instanceof DOMException)) throw error;
      reason = error.message;
    }
    if (delay === undefined) throw new Error(`Gave up on ${label} (${reason})`);
    console.warn(`  retrying ${label} in ${delay / 1000}s after ${reason}`);
    await sleep(delay);
  }
};

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

/** Where the archive lives: R2 in the nightly, a folder when trying it out. */
interface Store {
  /** The object's bytes, or null when there is no such object. */
  read: (key: string) => Promise<Uint8Array | null>;
  write: (key: string, bytes: Uint8Array, contentType: string) => Promise<void>;
  list: (prefix: string) => Promise<string[]>;
  remove: (key: string) => Promise<void>;
}

const envSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1).default('backfill-cells'),
});

const r2Store = (env: z.infer<typeof envSchema>): Store => {
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
  const bucketUrl = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}`;
  const send = async (url: string, init: RequestInit = {}) => {
    const res = await retrying(`R2 ${init.method ?? 'GET'}`, () => client.fetch(url, init));
    if (!res.ok && res.status !== 404)
      throw new Error(`R2 ${init.method ?? 'GET'} ${url}: HTTP ${res.status}`);
    return res;
  };
  return {
    read: async (key) => {
      const res = await send(`${bucketUrl}/${key}`);
      return res.status === 404 ? null : new Uint8Array(await res.arrayBuffer());
    },
    write: async (key, bytes, contentType) => {
      await send(`${bucketUrl}/${key}`, {
        method: 'PUT',
        body: new Uint8Array(bytes),
        headers: { 'Content-Type': contentType, 'Cache-Control': CACHE },
      });
    },
    list: async (prefix) => {
      const keys: string[] = [];
      for (let token: string | undefined, first = true; first || token; first = false) {
        const query = new URLSearchParams({ 'list-type': '2', prefix });
        if (token) query.set('continuation-token', token);
        const page = parseListing(await (await send(`${bucketUrl}?${query}`)).text());
        keys.push(...page.objects.map(({ key }) => key));
        token = page.next;
      }
      return keys;
    },
    remove: async (key) => {
      await send(`${bucketUrl}/${key}`, { method: 'DELETE' });
    },
  };
};

const folderStore = (root: string): Store => ({
  read: async (key) => {
    try {
      return await readFile(join(root, key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  },
  write: async (key, bytes) => {
    await mkdir(dirname(join(root, key)), { recursive: true });
    await writeFile(join(root, key), bytes);
  },
  list: async (prefix) => {
    try {
      return (await readdir(join(root, prefix))).map((name) => `${prefix}${name}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  },
  remove: (key) => rm(join(root, key), { force: true }),
});

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
  const outIndex = process.argv.indexOf('--out');
  const out = outIndex === -1 ? undefined : process.argv[outIndex + 1];
  if (outIndex !== -1 && !out) throw new Error('--out needs a folder');
  const store = out ? folderStore(out) : r2Store(envSchema.parse(process.env));
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
