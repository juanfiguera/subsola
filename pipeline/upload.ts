/**
 * Sends data/cells to the Cloudflare R2 bucket the app reads from. Only cells whose bytes changed
 * since the last upload are sent, index.json goes last so the app never sees an index pointing at
 * cells that aren't there yet, and cells the build no longer makes are removed after that.
 * data/insights.json, when `pnpm insights` made one, goes up after the index as insights.json at
 * the bucket root for subsola.com/insights; a night without one leaves the last copy up.
 * Everything under archive/ belongs to pipeline/archive and is never removed here (planUpload).
 *
 *   pnpm upload-cells           reads R2_* from .env.r2 locally, or from the environment in CI
 *   pnpm upload-cells --dry-run
 *   pnpm upload-cells --allow-shrink   when the build is meant to drop many cells
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AwsClient } from 'aws4fetch';
import { z } from 'zod';
import { dataDir } from './paths';
import { parseListing, planUpload } from './r2';

const CONCURRENCY = 16;
const RETRY_DELAYS_MS = [1_000, 4_000, 15_000];
// Cells change at most nightly; the index is what tells the app a new build is out.
const CELL_CACHE = 'public, max-age=3600';
const INDEX_CACHE = 'public, max-age=300';
const INDEX_KEY = 'index.json';
// Rebuilt with the cells; short-lived like the index so the page shows a new night's figures soon.
const INSIGHTS_KEY = 'insights.json';
const INSIGHTS_CACHE = 'public, max-age=300';
const JSON_CACHE: Record<string, string> = {
  [INDEX_KEY]: INDEX_CACHE,
  [INSIGHTS_KEY]: INSIGHTS_CACHE,
};
// A real build loses a handful of cells at most; losing more means a download came back short.
const MAX_REMOVED_SHARE = 0.02;

const envSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1).default('backfill-cells'),
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const md5 = (bytes: Uint8Array) => createHash('md5').update(bytes).digest('hex');

const runAll = async <T>(items: T[], work: (item: T) => Promise<void>) => {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await work(items[next++]!);
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
};

const main = async () => {
  const dryRun = process.argv.includes('--dry-run');
  const env = envSchema.parse(process.env);
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
  const bucketUrl = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}`;

  /** R2 drops a request now and then under load; network errors and 5xx are retried. */
  const send = async (url: string, init: RequestInit) => {
    for (let attempt = 0; ; attempt++) {
      const delay = RETRY_DELAYS_MS[attempt];
      let reason: string;
      try {
        const res = await client.fetch(url, init);
        if (res.ok) return res;
        reason = `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
        if (res.status < 500) throw new Error(`${init.method ?? 'GET'} ${url} ${reason}`);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        reason = error.message;
      }
      if (delay === undefined) throw new Error(`Gave up on ${url} (${reason})`);
      await sleep(delay);
    }
  };

  const cellDir = join(dataDir, 'cells');
  const local = new Map<string, string>();
  const bytesOf = new Map<string, Buffer>();
  for (const name of await readdir(cellDir)) {
    const bytes = await readFile(join(cellDir, name));
    local.set(name, md5(bytes));
    bytesOf.set(name, bytes);
  }
  if (!local.has(INDEX_KEY)) throw new Error(`No ${INDEX_KEY} in ${cellDir}; run pnpm build-cells`);
  const insightsPath = join(dataDir, INSIGHTS_KEY);
  if (existsSync(insightsPath)) {
    const bytes = await readFile(insightsPath);
    local.set(INSIGHTS_KEY, md5(bytes));
    bytesOf.set(INSIGHTS_KEY, bytes);
  } else console.warn(`No ${insightsPath}; the published ${INSIGHTS_KEY} stays as it was`);

  const remote = new Map<string, string>();
  for (let token: string | undefined, first = true; first || token; first = false) {
    const query = new URLSearchParams({ 'list-type': '2' });
    if (token) query.set('continuation-token', token);
    const page = parseListing(await (await send(`${bucketUrl}?${query}`, {})).text());
    for (const { key, etag } of page.objects) remote.set(key, etag);
    token = page.next;
  }

  const { send: changed, remove } = planUpload(local, remote, new Set([INSIGHTS_KEY]));
  const cells = changed.filter((key) => !(key in JSON_CACHE));
  const megabytes = cells.reduce((sum, key) => sum + bytesOf.get(key)!.length, 0) / 1e6;
  console.log(
    `${local.size.toLocaleString()} local files, ${remote.size.toLocaleString()} in ${env.R2_BUCKET}: ` +
      `${cells.length.toLocaleString()} cells to send (${megabytes.toFixed(0)} MB), ${remove.length} to remove`,
  );
  if (dryRun) return;
  if (remove.length > remote.size * MAX_REMOVED_SHARE && !process.argv.includes('--allow-shrink'))
    throw new Error(
      `The build would remove ${remove.length.toLocaleString()} of ${remote.size.toLocaleString()} cells; ` +
        'check data/stats.json, and pass --allow-shrink if that is expected',
    );

  const put = (key: string) =>
    send(`${bucketUrl}/${key}`, {
      method: 'PUT',
      body: new Uint8Array(bytesOf.get(key)!),
      headers: {
        // Stored gzipped and sent as is; the app unzips them itself (src/sources/cells.ts).
        'Content-Type': key in JSON_CACHE ? 'application/json' : 'application/gzip',
        'Cache-Control': JSON_CACHE[key] ?? CELL_CACHE,
      },
    });

  let done = 0;
  await runAll(cells, async (key) => {
    await put(key);
    done += 1;
    if (done % 1000 === 0)
      console.log(`  ${done.toLocaleString()} of ${cells.length.toLocaleString()}`);
  });
  if (changed.includes(INDEX_KEY)) await put(INDEX_KEY);
  if (changed.includes(INSIGHTS_KEY)) await put(INSIGHTS_KEY);
  await runAll(remove, async (key) => {
    await send(`${bucketUrl}/${key}`, { method: 'DELETE' });
  });
  console.log(
    `Sent ${cells.length.toLocaleString()} cells${changed.includes(INSIGHTS_KEY) ? ` and ${INSIGHTS_KEY}` : ''}, removed ${remove.length}.`,
  );
};

await main();
