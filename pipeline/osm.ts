/**
 * OpenStreetMap's manholes, street lamps and traffic signals for the five boroughs, from
 * Geofabrik's daily New York extract. The app never asks OpenStreetMap's volunteer-run Overpass
 * servers, whose usage policy rules out commercial use. Writes data/raw/osm/points.geojsonseq
 * for build-cells.
 *
 *   pnpm download-osm      needs osmium (brew install osmium-tool, apt install osmium-tool)
 */
import { execFile } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { promisify } from 'node:util';
import { OSM_FILTERS } from '../src/sources/assets';
import { dataDir, osmPointsPath } from './paths';

const EXTRACT_URL = 'https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf';
// The five boroughs with a little margin; the build keeps only points in cells that have city data.
const NYC_BBOX = '-74.27,40.49,-73.69,40.92';

const run = promisify(execFile);
const osmDir = join(dataDir, 'raw', 'osm');
const extractPath = join(osmDir, 'new-york.osm.pbf');

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

const main = async () => {
  await mkdir(osmDir, { recursive: true });
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

await main();
