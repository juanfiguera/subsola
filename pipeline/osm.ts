/**
 * OpenStreetMap's manholes, street lamps and traffic signals for the five boroughs, from
 * Geofabrik's daily New York extract. The app never asks OpenStreetMap's volunteer-run Overpass
 * servers, whose usage policy rules out commercial use. Writes data/raw/osm/points.geojsonseq
 * for build-cells. A night Geofabrik fails, the last good points are used instead, for up to
 * LAST_GOOD_MAX_DAYS, so one outside server can't stop every city's rebuild.
 *
 *   pnpm download-osm      needs osmium (brew install osmium-tool, apt install osmium-tool)
 */
import { execFile } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { promisify } from 'node:util';
import { OSM_FILTERS } from '../src/sources/assets';
import { dataDir, LAST_GOOD_MAX_DAYS, lastGoodDir, osmPointsPath } from './paths';

// Geofabrik moved each US state into its own folder in November 2026; the old flat URL now
// redirects to a 404.
const EXTRACT_URL =
  'https://download.geofabrik.de/north-america/us/new-york/new-york-latest.osm.pbf';
// The five boroughs with a little margin; the build keeps only points in cells that have city data.
const NYC_BBOX = '-74.27,40.49,-73.69,40.92';

const run = promisify(execFile);
const osmDir = join(dataDir, 'raw', 'osm');
const extractPath = join(osmDir, 'new-york.osm.pbf');
const lastGood = lastGoodDir('osm');
const lastGoodPoints = join(lastGood, 'points.geojsonseq');
const lastGoodSavedAt = join(lastGood, 'saved-at');

/** Geofabrik rebuilds the extract once a day; a copy at least that new isn't fetched again. */
const downloadExtract = async () => {
  const head = await fetch(EXTRACT_URL, { method: 'HEAD' });
  if (!head.ok) throw new Error(`Geofabrik HEAD returned ${head.status}`);
  const published = new Date(head.headers.get('last-modified') ?? 0);
  if (existsSync(extractPath) && (await stat(extractPath)).mtime >= published) {
    console.log(`Extract from ${published.toISOString()} already here`);
    return;
  }
  const res = await fetch(EXTRACT_URL);
  if (!res.ok || !res.body) throw new Error(`Geofabrik returned ${res.status}`);
  const expected = Number(res.headers.get('content-length'));
  const partPath = `${extractPath}.part`;
  await pipeline(Readable.fromWeb(res.body as NodeReadableStream), createWriteStream(partPath));
  const { size } = await stat(partPath);
  if (expected && size !== expected)
    throw new Error(`Extract cut off at ${size} of ${expected} bytes`);
  await rename(partPath, extractPath);
  console.log(`Downloaded ${(size / 1e6).toFixed(0)} MB, published ${published.toISOString()}`);
};

const cutPoints = async () => {
  await downloadExtract();
  const filtered = join(osmDir, 'filtered.osm.pbf');
  const clipped = join(osmDir, 'nyc.osm.pbf');
  // Tags first: it shrinks the state to a few hundred thousand nodes, so the clip is quick.
  await run('osmium', ['tags-filter', extractPath, ...OSM_FILTERS, '-o', filtered, '--overwrite']);
  await run('osmium', ['extract', '-b', NYC_BBOX, filtered, '-o', clipped, '--overwrite']);
  await run('osmium', [
    'export',
    clipped,
    '-f',
    'geojsonseq',
    '--add-unique-id=type_id',
    '--format-option=print_record_separator=false',
    '-o',
    osmPointsPath,
    '--overwrite',
  ]);
  const points = (await readFile(osmPointsPath, 'utf8')).split('\n').filter(Boolean).length;
  console.log(`${points.toLocaleString()} points in ${osmPointsPath}`);
};

/** Puts back the last good points after a failed night; says whether there were any recent enough. */
const restoreLastGood = async () => {
  if (!existsSync(lastGoodPoints) || !existsSync(lastGoodSavedAt)) return false;
  const savedAt = (await readFile(lastGoodSavedAt, 'utf8')).trim();
  const days = (Date.now() - Date.parse(savedAt)) / 86_400_000;
  if (!(days <= LAST_GOOD_MAX_DAYS)) return false;
  await copyFile(lastGoodPoints, osmPointsPath);
  console.log(
    `::warning::OpenStreetMap points: using the last good copy, from ${savedAt.slice(0, 10)}`,
  );
  return true;
};

const main = async () => {
  await mkdir(osmDir, { recursive: true });
  try {
    await cutPoints();
  } catch (error) {
    console.error(error);
    // With no copy recent enough the night fails, so a source that moved is noticed within a month.
    if (!(await restoreLastGood())) throw error;
    return;
  }
  await mkdir(lastGood, { recursive: true });
  await copyFile(osmPointsPath, lastGoodPoints);
  await writeFile(lastGoodSavedAt, new Date().toISOString());
};

await main();
