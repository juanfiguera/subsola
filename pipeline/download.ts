/**
 * Downloads every NYC Open Data row the app uses, citywide, into data/raw/<dataset>/<page>.json.gz.
 * Pages already on disk are skipped, so an interrupted run picks up where it stopped.
 *
 *   pnpm download                      every dataset
 *   pnpm download hydrants centerline  just these
 */
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { Agent, setGlobalDispatcher } from 'undici';
import { csvRowMatches, csvRows } from './csv';
import { CITY_DATASETS, DATASETS, type DatasetSpec } from './datasets';
import { onlyCity } from './city';
import { isPaused } from '../src/sources/catalog';
import { dataDir } from './paths';

const BASE_URL = 'https://data.cityofnewyork.us/resource';
// Six at once measured about 6,000 permit rows a second without throttling.
const CONCURRENCY = Number(process.env.DOWNLOAD_CONCURRENCY ?? 6);
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN;

// Socrata pages by offset, so a page deep into a big set makes it walk every row before it:
// 50,000 permits past row 3.3M took 5.5 minutes, longer than fetch's 5 minute default.
setGlobalDispatcher(new Agent({ headersTimeout: 15 * 60_000, bodyTimeout: 15 * 60_000 }));

const headers: Record<string, string> = APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const soqlUrl = (spec: DatasetSpec, params: Record<string, string>) => {
  const query = new URLSearchParams(params);
  if (spec.where) query.set('$where', spec.where);
  return `${spec.socrata ?? BASE_URL}/${spec.id}.json?${query}`;
};

/**
 * NYC Open Data drops or throttles requests under load, and now and then ends a big response
 * early with a 200; all of those are retried, anything else isn't. Returns the text and its parse.
 */
const fetchJson = async (
  url: string,
  requestHeaders = headers,
): Promise<{ text: string; body: unknown }> => {
  for (let attempt = 0; ; attempt++) {
    const delay = RETRY_DELAYS_MS[attempt];
    let reason: string;
    try {
      const res = await fetch(url, { headers: requestHeaders });
      if (res.ok) {
        const text = await res.text();
        return { text, body: JSON.parse(text) as unknown };
      }
      reason = `HTTP ${res.status}`;
      // 408 is Socrata giving up on a slow query, which goes through on a quieter try. SanGIS has
      // answered a busy night with 403 and Seattle's ArcGIS with a bare 304, and both served the
      // same pages hours earlier, so those get the same retries before a layer is left out.
      if (![304, 403, 408, 429].includes(res.status) && res.status < 500)
        throw new Error(`${reason}: ${(await res.text()).slice(0, 300)}`);
    } catch (error) {
      if (!(error instanceof TypeError) && !(error instanceof SyntaxError)) throw error;
      reason = error instanceof SyntaxError ? 'a cut-off response' : error.message;
    }
    if (delay === undefined) throw new Error(`Gave up after ${attempt + 1} tries (${reason})`);
    console.warn(`  retrying in ${delay / 1000}s after ${reason}`);
    await sleep(delay);
  }
};

/** The body as a JSON array of rows, text and all, ready to store as a page. */
const fetchJsonArray = async (url: string): Promise<{ text: string; length: number }> => {
  const { text, body } = await fetchJson(url);
  if (!Array.isArray(body)) throw new Error(`Expected a JSON array from ${url}`);
  return { text, length: body.length };
};

const arcgisUrl = (
  { layer, where, within }: NonNullable<DatasetSpec['arcgis']>,
  params: Record<string, string>,
) =>
  `${layer}/query?${new URLSearchParams({
    where: where ?? '1=1',
    f: 'json',
    ...(within && {
      geometry: within.join(','),
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
    }),
    ...params,
  })}`;

/**
 * An ArcGIS query's answer. A busy server answers 200 with a 5xx error in the body ("Wait timeout
 * for the request exceeded"), which is retried like an HTTP 5xx.
 */
const fetchArcgis = async (url: string): Promise<Record<string, unknown>> => {
  for (let attempt = 0; ; attempt++) {
    // Not NYC Open Data, so no app token goes along.
    const body = (await fetchJson(url, {})).body as Record<string, unknown>;
    const code = (body.error as { code?: number } | undefined)?.code ?? 0;
    const delay = RETRY_DELAYS_MS[attempt];
    if (code < 500 || delay === undefined) return body;
    console.warn(`  retrying in ${delay / 1000}s after ArcGIS error ${code}`);
    await sleep(delay);
  }
};

/** An ArcGIS query's features, stored the way Socrata rows are: attributes, plus any shape. */
const fetchArcgisRows = async (url: string) => {
  const body = (await fetchArcgis(url)) as {
    features?: { attributes: Record<string, unknown>; geometry?: unknown }[];
    error?: unknown;
  };
  if (!body.features) throw new Error(`ArcGIS query failed: ${JSON.stringify(body.error ?? body)}`);
  return JSON.stringify(
    body.features.map(({ attributes, geometry }) =>
      geometry ? { ...attributes, geometry } : attributes,
    ),
  );
};

/** The lowest and highest id in an ArcGIS layer, for paging it by id ranges. */
const idRange = async (arcgis: NonNullable<DatasetSpec['arcgis']>) => {
  const statistic = (statisticType: string, outStatisticFieldName: string) => ({
    statisticType,
    onStatisticField: arcgis.orderBy,
    outStatisticFieldName,
  });
  const body = (await fetchArcgis(
    arcgisUrl(arcgis, {
      outStatistics: JSON.stringify([statistic('min', 'low'), statistic('max', 'high')]),
    }),
  )) as { features?: { attributes: { low?: number; high?: number } }[] };
  const range = body.features?.[0]?.attributes;
  if (range?.low == null || range.high == null) throw new Error(`No id range for ${arcgis.layer}`);
  return { low: range.low, high: range.high };
};

// Each id-paged dataset's lowest id, so a page number turns into its id range.
const idStarts = new Map<string, number>();

/** How many pages a dataset takes. */
const countPages = async (spec: DatasetSpec, rows: number): Promise<number> => {
  if (!spec.arcgis?.byId) return Math.ceil(rows / spec.pageRows);
  const { low, high } = await idRange(spec.arcgis);
  idStarts.set(spec.name, low);
  return Math.ceil((high - low + 1) / spec.pageRows);
};

const countRows = async (spec: DatasetSpec): Promise<number> => {
  if (spec.arcgis) {
    const body = (await fetchArcgis(arcgisUrl(spec.arcgis, { returnCountOnly: 'true' }))) as {
      count?: number;
    };
    if (body.count === undefined) throw new Error(`No count from ${spec.arcgis.layer}`);
    return body.count;
  }
  const { text } = await fetchJsonArray(soqlUrl(spec, { $select: 'count(*) as n' }));
  return Number((JSON.parse(text) as { n: string }[])[0]?.n ?? 0);
};

interface PageTask {
  spec: DatasetSpec;
  page: number;
  path: string;
}

const pagePath = (name: string, page: number) =>
  join(dataDir, 'raw', name, `${String(page).padStart(4, '0')}.json.gz`);

const pageText = async ({ spec, page }: PageTask) => {
  const start = idStarts.get(spec.name);
  if (spec.arcgis && start !== undefined) {
    const from = start + page * spec.pageRows;
    const range = `${spec.arcgis.orderBy} >= ${from} AND ${spec.arcgis.orderBy} < ${from + spec.pageRows}`;
    return fetchArcgisRows(
      arcgisUrl(
        {
          ...spec.arcgis,
          where: spec.arcgis.where ? `(${spec.arcgis.where}) AND ${range}` : range,
        },
        {
          outFields: spec.select,
          returnGeometry: String(Boolean(spec.arcgis.geometry)),
          outSR: '4326',
        },
      ),
    );
  }
  if (spec.arcgis)
    return fetchArcgisRows(
      arcgisUrl(spec.arcgis, {
        outFields: spec.select,
        returnGeometry: String(Boolean(spec.arcgis.geometry)),
        outSR: '4326',
        orderByFields: spec.arcgis.orderBy,
        resultOffset: String(page * spec.pageRows),
        resultRecordCount: String(spec.pageRows),
      }),
    );
  const { text } = await fetchJsonArray(
    soqlUrl(spec, {
      $select: spec.select,
      // Paging is only stable in a fixed order.
      $order: ':id',
      $limit: String(spec.pageRows),
      $offset: String(page * spec.pageRows),
    }),
  );
  return text;
};

const downloadPage = async (task: PageTask) => {
  const { path } = task;
  const text = await pageText(task);
  // Written aside and moved into place, so a page on disk is always a whole page.
  await writeFile(`${path}.part`, gzipSync(text));
  await rename(`${path}.part`, path);
};

/** What a dataset's pages were cut from; pages cut another way don't line up. */
const queryOf = (spec: DatasetSpec) => {
  const within = spec.arcgis?.within ? `|${spec.arcgis.within.join(',')}` : '';
  const csv = spec.csv
    ? `${spec.csv.url}|${Object.entries(spec.csv.match)
        .map(([column, pattern]) => `${column} ~ ${String(pattern)}`)
        .join(' AND ')}`
    : '';
  return `${spec.arcgis?.where ?? spec.where ?? csv}${within}|${spec.select}`;
};

/**
 * A CSV file's version, from its ETag or date, so the datasets cut from it are fetched again only
 * once the file changes. With neither, they're fetched every run.
 */
const csvVersion = async (url: string) => {
  const res = await fetch(url, { method: 'HEAD' });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.headers.get('etag') ?? res.headers.get('last-modified') ?? new Date().toISOString();
};

async function* textChunks(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  // Streaming, so a character split between two chunks comes out whole.
  const decoder = new TextDecoder();
  for (let next = await reader.read(); !next.done; next = await reader.read())
    yield decoder.decode(next.value, { stream: true });
  yield decoder.decode();
}

/**
 * The datasets cut from one CSV file, all in one pass as it streams in, saved in pages like the
 * others. A dataset already cut the same way from this version of the file is left alone. Its
 * meta.json is written last, so one cut short is fetched again whole.
 */
const downloadCsv = async (url: string, specs: DatasetSpec[]) => {
  const version = await csvVersion(url);
  const stale: DatasetSpec[] = [];
  for (const spec of specs) {
    const metaPath = join(dataDir, 'raw', spec.name, 'meta.json');
    const previous = existsSync(metaPath)
      ? (JSON.parse(await readFile(metaPath, 'utf8')) as { query?: string; version?: string })
      : null;
    if (previous?.query === queryOf(spec) && previous.version === version)
      console.log(`${spec.name}: already have ${url} as of ${version}`);
    else stale.push(spec);
  }
  if (!stale.length) return;
  const outputs = await Promise.all(
    stale.map(async (spec) => {
      const dir = join(dataDir, 'raw', spec.name);
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
      return { spec, columns: spec.select.split(','), page: [] as object[], pages: 0, rows: 0 };
    }),
  );
  const savePage = async (output: (typeof outputs)[number]) => {
    const path = pagePath(output.spec.name, output.pages);
    await writeFile(`${path}.part`, gzipSync(JSON.stringify(output.page)));
    await rename(`${path}.part`, path);
    output.pages += 1;
    output.page = [];
  };
  console.log(`${stale.map((spec) => spec.name).join(', ')}: reading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} from ${url}`);
  for await (const row of csvRows(textChunks(res.body))) {
    for (const output of outputs) {
      if (!csvRowMatches(row, output.spec.csv!.match)) continue;
      output.page.push(
        Object.fromEntries(
          output.columns.filter((column) => column in row).map((column) => [column, row[column]]),
        ),
      );
      output.rows += 1;
      if (output.page.length === output.spec.pageRows) await savePage(output);
    }
  }
  for (const output of outputs) {
    if (output.page.length) await savePage(output);
    const { spec, rows, pages } = output;
    await writeFile(
      join(dataDir, 'raw', spec.name, 'meta.json'),
      JSON.stringify(
        {
          id: spec.id,
          rows,
          pages,
          pageRows: spec.pageRows,
          version,
          query: queryOf(spec),
          countedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log(`${spec.name}: ${rows.toLocaleString()} rows in ${pages} pages`);
  }
};

// The last complete download of each optional dataset, kept between nightly runs (see
// nightly.yml), so a server that turns us away for a night costs a day's freshness, not the layer.
const lastGoodDir = (name: string) => join(dataDir, 'last-good', name);
// Older than this, a layer is better left out than shown as if current.
const LAST_GOOD_MAX_DAYS = 30;

const keepAsLastGood = async (spec: DatasetSpec) => {
  const dir = lastGoodDir(spec.name);
  await rm(dir, { recursive: true, force: true });
  await cp(join(dataDir, 'raw', spec.name), dir, { recursive: true });
  await writeFile(join(dir, 'saved-at'), new Date().toISOString());
};

/** Puts back the last good copy of a dataset that failed tonight; says whether there was one. */
const restoreLastGood = async (spec: DatasetSpec) => {
  const dir = lastGoodDir(spec.name);
  if (!existsSync(join(dir, 'meta.json')) || !existsSync(join(dir, 'saved-at'))) return false;
  const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')) as { query?: string };
  const savedAt = (await readFile(join(dir, 'saved-at'), 'utf8')).trim();
  const days = (Date.now() - Date.parse(savedAt)) / 86_400_000;
  if (meta.query !== queryOf(spec) || !(days <= LAST_GOOD_MAX_DAYS)) return false;
  await cp(dir, join(dataDir, 'raw', spec.name), { recursive: true });
  await rm(join(dataDir, 'raw', spec.name, 'saved-at'), { force: true });
  console.warn(`${spec.name}: using the last good download, from ${savedAt.slice(0, 10)}`);
  return true;
};

const main = async () => {
  const wanted = process.argv.slice(2);
  const unknown = wanted.filter((name) => !DATASETS.some((spec) => spec.name === name));
  if (unknown.length) throw new Error(`Unknown dataset: ${unknown.join(', ')}`);
  const everyone = onlyCity ? CITY_DATASETS[onlyCity] : DATASETS;
  const asked = wanted.length ? DATASETS.filter((spec) => wanted.includes(spec.name)) : everyone;
  // A paused source isn't fetched, and no old copy is kept to fall back on.
  for (const spec of asked.filter((candidate) => isPaused(candidate.name))) {
    await rm(join(dataDir, 'raw', spec.name), { recursive: true, force: true });
    await rm(lastGoodDir(spec.name), { recursive: true, force: true });
    console.warn(`${spec.name}: paused, not downloaded`);
  }
  const specs = asked.filter((spec) => !isPaused(spec.name));

  const tasks: PageTask[] = [];
  const skipped = new Set<string>();
  // An optional dataset that fails is left out whole: half a sewer network is worse than none.
  // Its pages are cleared once every download has stopped, so none is still writing into them.
  const skip = (spec: DatasetSpec, error: unknown) => {
    if (skipped.has(spec.name)) return;
    skipped.add(spec.name);
    console.warn(`${spec.name}: skipped tonight, ${String(error)}`);
  };
  for (const spec of specs) {
    // A CSV file can't be counted or paged before it's read; it's read whole below.
    if (spec.csv) continue;
    let rows: number;
    let pages: number;
    try {
      rows = await countRows(spec);
      pages = await countPages(spec, rows);
    } catch (error) {
      if (!spec.optional) throw error;
      skip(spec, error);
      continue;
    }
    const dir = join(dataDir, 'raw', spec.name);
    const metaPath = join(dir, 'meta.json');
    // Pages cut another way, or asked for other rows or fields, don't line up with these, so
    // they start over. So do pages cut by offset once the row count moves, since every row after
    // the change shifts; the nightly build keeps frozen sets between runs and counts on this.
    const previous = existsSync(metaPath)
      ? (JSON.parse(await readFile(metaPath, 'utf8')) as {
          rows?: number;
          pageRows?: number;
          byId?: boolean;
          query?: string;
        })
      : null;
    const byId = Boolean(spec.arcgis?.byId);
    const query = queryOf(spec);
    if (
      previous &&
      (previous.pageRows !== spec.pageRows ||
        Boolean(previous.byId) !== byId ||
        previous.query !== query ||
        (!byId && previous.rows !== rows))
    )
      await rm(dir, { recursive: true });
    await mkdir(dir, { recursive: true });
    await writeFile(
      metaPath,
      JSON.stringify(
        {
          id: spec.id,
          rows,
          pages,
          pageRows: spec.pageRows,
          byId,
          query,
          countedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    const missing = Array.from({ length: pages }, (_, page) => ({
      spec,
      page,
      path: pagePath(spec.name, page),
    })).filter((task) => !existsSync(task.path));
    console.log(
      `${spec.name}: ${rows.toLocaleString()} rows, ${missing.length} of ${pages} pages to fetch`,
    );
    tasks.push(...missing);
  }

  const started = Date.now();
  let done = 0;
  const failures: string[] = [];
  const worker = async () => {
    for (let task = tasks.shift(); task; task = tasks.shift()) {
      if (skipped.has(task.spec.name)) continue;
      try {
        await downloadPage(task);
      } catch (error) {
        if (task.spec.optional) {
          skip(task.spec, error);
          continue;
        }
        failures.push(`${task.spec.name} page ${task.page}: ${String(error)}`);
        console.error(`  ${failures.at(-1)}`);
        continue;
      }
      done += 1;
      const seconds = Math.round((Date.now() - started) / 1000);
      console.log(
        `  ${task.spec.name} page ${task.page} (${done} done, ${tasks.length} queued, ${seconds}s)`,
      );
    }
  };
  const csvSpecs = specs.filter((spec) => spec.csv);
  const csvDownloads = async () => {
    for (const url of new Set(csvSpecs.map((spec) => spec.csv!.url))) {
      const group = csvSpecs.filter((spec) => spec.csv!.url === url);
      try {
        await downloadCsv(url, group);
      } catch (error) {
        for (const spec of group) {
          if (spec.optional) skip(spec, error);
          else {
            failures.push(`${spec.name}: ${String(error)}`);
            console.error(`  ${failures.at(-1)}`);
          }
        }
      }
    }
  };
  await Promise.all([...Array.from({ length: CONCURRENCY }, worker), csvDownloads()]);

  for (const spec of specs.filter((candidate) => candidate.optional)) {
    if (skipped.has(spec.name)) {
      await rm(join(dataDir, 'raw', spec.name), { recursive: true, force: true });
      if (!(await restoreLastGood(spec)))
        console.warn(`${spec.name}: no recent good download to fall back on, left out`);
    } else await keepAsLastGood(spec);
  }

  if (failures.length) {
    console.error(`${failures.length} pages failed; run again to retry them.`);
    process.exitCode = 1;
  }
  console.log(`Finished in ${Math.round((Date.now() - started) / 1000)}s.`);
};

await main();
