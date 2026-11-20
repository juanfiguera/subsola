/**
 * Turns the downloads in data/raw into one bundle per 250 m cell in data/cells, holding the rows
 * the app would have fetched for that ground. Permits are grouped by block here, since placing
 * blocks is the slow part; everything else stays as rows for the app to convert as usual.
 *
 *   pnpm build-cells
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Position } from 'geojson';

type MultiLineString = { coordinates: number[][][] };
type MultiPolygon = { coordinates: number[][][][] };
import { gridCell, gridCellBounds, gridCellOf, type GridCell } from '../src/grid';
import { creditLine, OSM_CREDIT } from '../src/attribution';
import { regionAt, REGIONS } from '../src/regions';
import { clipLine, clipPolygon } from './clip';
import {
  classifyPermit,
  groupPermits,
  permitSchema,
  type DatasetRow,
  type PermitDataset,
} from '../src/sources/permits';
import {
  blockLocator,
  normalizeStreetName,
  streetsFromRows,
  type StreetRow,
} from '../src/sources/streets';
import { currentConnectionBbl, historicConnectionBbl } from '../src/sources/connections';
import { DATASETS, type DatasetSpec } from './datasets';
import { readRows, type RowCounts } from './raw';
import { createShardWriter } from './shards';
import { everyCell, middleCell, piecesOf, type Placement } from './placement';
import { buildsCity } from './city';
import { buildDc } from './dc/build';
import { buildSf } from './sf/build';
import { buildLa } from './la/build';
import { buildSd } from './sd/build';
import { buildSea } from './sea/build';
import { buildDen } from './den/build';
import { buildChi } from './chi/build';
import { buildDal } from './dal/build';
import { dataDir, osmPointsPath } from './paths';
import { loadStormAreas } from './ms4';
import { OSM_KEPT_TAGS } from '../src/sources/assets';

const BUCKETS = 64;
const GZIP_OS_BYTE = 9;
const GZIP_OS_UNKNOWN = 255;
const shardDir = join(dataDir, 'shards');
const bucketDir = join(dataDir, 'buckets');
const cellDir = join(dataDir, 'cells');

const specOf = (name: DatasetSpec['name']) => {
  const spec = DATASETS.find((candidate) => candidate.name === name);
  if (!spec) throw new Error(`No dataset spec for ${name}`);
  return spec;
};

const elapsed = (started: number) => `${Math.round((performance.now() - started) / 1000)}s`;

const hashOf = (text: string) => {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (Math.imul(hash, 31) + text.charCodeAt(i)) | 0;
  return Math.abs(hash);
};

interface Stats {
  datasets: Record<string, RowCounts & { cells: number; placed: number }>;
  permits: Record<string, { utilityRows: number; withGeometry: number; placed: number }>;
  cells: number;
  bytes: number;
}

// Seven decimal places of a degree is about a centimeter, finer than any of these surveys.
const roundCoordinates = (_key: string, value: unknown) =>
  typeof value === 'number' && !Number.isInteger(value) ? Math.round(value * 1e7) / 1e7 : value;

const main = async () => {
  const started = performance.now();
  await Promise.all(
    [shardDir, bucketDir, cellDir].map((dir) => rm(dir, { recursive: true, force: true })),
  );
  const shards = await createShardWriter(shardDir);
  const stats: Stats = { datasets: {}, permits: {}, cells: 0, bytes: 0 };

  /**
   * Streams a dataset into cells: each row, or the piece of it inside, goes to the cells `place`
   * picks, filed under `as` (another city's data goes in under the NYC name the app reads).
   */
  const shardDataset = async <R>(
    name: DatasetSpec['name'],
    place: (row: R) => Placement[],
    as: string = name,
  ) => {
    const counts = { read: 0, rejected: 0, cells: 0, placed: 0 };
    for await (const row of readRows(specOf(name), counts) as AsyncIterable<R>) {
      const placements = place(row);
      if (placements.length) counts.placed += 1;
      for (const [cell, piece] of placements) await shards.add(cell.key, as, piece);
      counts.cells += placements.length;
    }
    stats.datasets[name] = counts;
    console.log(
      `${name}: ${counts.placed.toLocaleString()} of ${counts.read.toLocaleString()} rows placed (${counts.rejected} rejected), ${elapsed(started)}`,
    );
  };

  let groupCount = 0;

  // New York's own layers and permits, which the other cities' builders don't share.
  const buildNyc = async () => {
    // Streets first: they also place permits that come with names only. Kept whole in every cell
    // they touch, since labels and the block locator need each segment end to end.
    const streetRows: StreetRow[] = [];
    await shardDataset('centerline', (row: StreetRow) => {
      streetRows.push(row);
      return row.the_geom ? everyCell(row, row.the_geom.coordinates) : [];
    });
    const locate = blockLocator(streetsFromRows(streetRows));

    // Roadbed and sidewalk polygons can run for many blocks; each cell keeps only its own piece.
    await shardDataset('curbs', (row: { the_geom: MultiLineString }) =>
      piecesOf(row.the_geom.coordinates, (lines, box) => {
        const coordinates = lines.flatMap((line) => clipLine(line, box));
        return coordinates.length ? { the_geom: { type: 'MultiLineString', coordinates } } : null;
      }),
    );
    for (const name of ['roadbed', 'sidewalks'] as const)
      await shardDataset(name, (row: { the_geom: MultiPolygon }) =>
        piecesOf(row.the_geom.coordinates, (polygons, box) => {
          const coordinates = polygons
            .map((polygon) => clipPolygon(polygon, box))
            .filter((p) => p.length);
          return coordinates.length ? { the_geom: { type: 'MultiPolygon', coordinates } } : null;
        }),
      );
    // Buildings are small; one cell each is enough.
    await shardDataset('buildings', (row: { the_geom: MultiPolygon }) =>
      middleCell(row, row.the_geom.coordinates),
    );
    await shardDataset('hydrants', (row: { the_geom: { coordinates: Position } }) =>
      middleCell(row, row.the_geom.coordinates),
    );
    // Each basin is tagged with the storm outfall it drains to, or '' when it's outside every
    // mapped storm sewer area (so the app can tell "checked" from "not known").
    const stormAreaOf = await loadStormAreas();
    await shardDataset('catchBasins', (row: { the_geom: { coordinates: Position } }) => {
      const area = stormAreaOf(row.the_geom.coordinates);
      return middleCell(
        { ...row, ms4_outfall: area?.outfall ?? '', ms4_water: area?.water ?? '' },
        row.the_geom.coordinates,
      );
    });
    await shardDataset('linkNyc', (row: { latitude?: string; longitude?: string }) =>
      row.latitude && row.longitude
        ? middleCell(row, [Number(row.longitude), Number(row.latitude)])
        : [],
    );

    await shardDataset('conEdStructures', (row: { LATITUDE: number; LONGITUDE: number }) =>
      middleCell(row, [row.LONGITUDE, row.LATITUDE]),
    );

    for (const name of [
      'signalsLpi',
      'signalsAccessible',
      'signalsExclusive',
      'elevations',
      'outfalls',
    ] as const)
      await shardDataset(name, (row: { the_geom: { coordinates: Position } }) =>
        middleCell(row, row.the_geom.coordinates),
      );

    // DEP files connection permits by lot with no location, so they go wherever their lot went.
    const lotCells = new Map<string, GridCell[]>();
    await shardDataset('serviceLines', (row: { tbbl: string; the_geom: MultiPolygon }) => {
      const placements = everyCell(row, row.the_geom.coordinates);
      lotCells.set(
        row.tbbl,
        placements.map(([cell]) => cell),
      );
      return placements;
    });
    const lotPlacements = (bbl: string | null, row: unknown): Placement[] =>
      (lotCells.get(bbl ?? '') ?? []).map((cell) => [cell, row]);
    await shardDataset('connectionPermits', (row: Parameters<typeof currentConnectionBbl>[0]) =>
      lotPlacements(currentConnectionBbl(row), row),
    );
    await shardDataset(
      'connectionPermitsHistoric',
      (row: Parameters<typeof historicConnectionBbl>[0]) =>
        lotPlacements(historicConnectionBbl(row), row),
    );
    lotCells.clear();

    // Permits on one block can be filed years apart in either dataset; bucketing by borough and
    // street keeps each block's permits together so it is grouped once.
    const buckets = await createShardWriter(bucketDir);
    for (const dataset of ['permitsCurrent', 'permitsHistoric'] as PermitDataset[]) {
      const counts = { read: 0, rejected: 0 };
      for await (const row of readRows({ ...specOf(dataset), schema: permitSchema }, counts)) {
        const utility = classifyPermit(row.permittypedesc, row.permitteename);
        if (!utility) continue;
        const borough = row.boroughname ?? '';
        const tally = (stats.permits[borough] ??= { utilityRows: 0, withGeometry: 0, placed: 0 });
        tally.utilityRows += 1;
        if (row.wkt) tally.withGeometry += 1;
        const street = row.onstreetname
          ? `${borough}|${normalizeStreetName(row.onstreetname)}`
          : (row.wkt ?? row.permitnumber);
        await buckets.add(String(hashOf(street) % BUCKETS), dataset, row);
      }
      console.log(`${dataset}: ${counts.read.toLocaleString()} rows bucketed, ${elapsed(started)}`);
    }
    await buckets.flush();

    for (const bucket of await readdir(bucketDir)) {
      const rows: DatasetRow[] = (await readFile(join(bucketDir, bucket), 'utf8'))
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const tab = line.indexOf('\t');
          return {
            dataset: line.slice(0, tab) as PermitDataset,
            row: JSON.parse(line.slice(tab + 1)),
          };
        });
      const placed = new Set<string>();
      for (const group of groupPermits(rows, locate)) {
        groupCount += 1;
        for (const permit of group.properties.permits)
          placed.add(`${permit.dataset}|${permit.permitNumber}`);
        const geometry = group.geometry;
        if (!('coordinates' in geometry)) continue;
        // One cell per block: the app always loads the cells around the view, so a block reaching
        // into a neighbor still shows, and it isn't stored twice.
        for (const [cell] of middleCell(group, geometry.coordinates))
          await shards.add(cell.key, 'permitGroups', group);
      }
      for (const { row, dataset } of rows) {
        const tally = stats.permits[row.boroughname ?? ''];
        if (tally && placed.has(`${dataset}|${row.permitnumber}`)) tally.placed += 1;
      }
    }
  };
  if (buildsCity('nyc')) await buildNyc();

  const tools = {
    shardDataset,
    readRows: (name: DatasetSpec['name']) => readRows(specOf(name)),
    shards,
  };
  const cityBuilds = [
    ['dc', buildDc],
    ['sf', buildSf],
    ['la', buildLa],
    ['sd', buildSd],
    ['sea', buildSea],
    ['den', buildDen],
    ['chi', buildChi],
    ['dal', buildDal],
  ] as const;
  for (const [city, build] of cityBuilds) if (buildsCity(city)) groupCount += await build(tools);

  // OpenStreetMap points go only into cells the city's own data made, so the clip box's corners
  // of New Jersey, Westchester and Nassau don't become cells of lamps alone.
  const hasOsm = existsSync(osmPointsPath);
  if (hasOsm) {
    const counts = { read: 0, rejected: 0, cells: 0, placed: 0 };
    for (const line of (await readFile(osmPointsPath, 'utf8')).split('\n')) {
      if (!line) continue;
      counts.read += 1;
      const feature = JSON.parse(line) as {
        id: string;
        geometry: { coordinates: [number, number] };
        properties: Record<string, string>;
      };
      const [lon, lat] = feature.geometry.coordinates;
      const cell = gridCellOf([lon, lat]);
      if (!shards.has(cell.key)) continue;
      const tags = Object.fromEntries(
        OSM_KEPT_TAGS.flatMap((key) =>
          feature.properties[key] ? [[key, feature.properties[key]]] : [],
        ),
      );
      // osmium's type_id ids look like n12345.
      await shards.add(cell.key, 'osm', { id: Number(feature.id.slice(1)), lat, lon, tags });
      counts.placed += 1;
      counts.cells += 1;
    }
    stats.datasets.osm = counts;
    console.log(
      `osm: ${counts.placed.toLocaleString()} of ${counts.read.toLocaleString()} points placed`,
    );
  } else console.warn(`No ${osmPointsPath}; run pnpm download-osm for OpenStreetMap's points.`);

  await shards.flush();
  await rm(bucketDir, { recursive: true, force: true });
  console.log(`permits: ${groupCount.toLocaleString()} block groups, ${elapsed(started)}`);

  await mkdir(cellDir, { recursive: true });
  const index: Record<string, number> = {};
  for (const key of await readdir(shardDir)) {
    const bundle: Record<string, unknown[]> = {};
    for (const line of (await readFile(join(shardDir, key), 'utf8')).split('\n')) {
      if (!line) continue;
      const tab = line.indexOf('\t');
      (bundle[line.slice(0, tab)] ??= []).push(JSON.parse(line.slice(tab + 1)));
    }
    // Each file carries its own credits, as ODbL and the cities' licenses ask of a copy that
    // travels without the site around it.
    const [i, j] = key.split('_').map(Number);
    const [west, south, east, north] = gridCellBounds(gridCell(i!, j!));
    const region = regionAt([(west + east) / 2, (south + north) / 2]);
    const credits = region ? creditLine(region.id) : OSM_CREDIT.text;
    const body = gzipSync(JSON.stringify({ v: 1, key, credits, ...bundle }, roundCoordinates));
    // gzip records the OS that wrote the file (3 on Linux, 19 on macOS). Pinned to "unknown" so a
    // laptop build and a nightly build of the same data are the same bytes and upload skips them.
    body[GZIP_OS_BYTE] = GZIP_OS_UNKNOWN;
    await writeFile(join(cellDir, `${key}.json.gz`), body);
    index[key] = body.length;
    stats.cells += 1;
    stats.bytes += body.length;
  }
  await rm(shardDir, { recursive: true, force: true });
  await writeFile(
    join(cellDir, 'index.json'),
    JSON.stringify({
      v: 1,
      builtAt: new Date().toISOString(),
      osm: hasOsm,
      credits: {
        ...Object.fromEntries(REGIONS.map((region) => [region.id, creditLine(region.id)])),
        osm: `${OSM_CREDIT.text} OpenStreetMap-derived layers (osm, and signals matched against it) are under ODbL 1.0: https://opendatacommons.org/licenses/odbl/1-0/`,
        all: 'https://subsola.com/credits',
      },
      cells: index,
    }),
  );
  await writeFile(join(dataDir, 'stats.json'), JSON.stringify(stats, null, 2));
  console.log(
    `${stats.cells.toLocaleString()} cells, ${(stats.bytes / 1e6).toFixed(0)} MB, ${elapsed(started)}`,
  );
};

await main();
