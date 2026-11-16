import type { Geometry } from 'geojson';
import type { z } from 'zod';
import type { SourceKey } from '../../src/sources/catalog';
import type { BuiltAssetRow } from '../../src/sources/assets';
import { permitGroupFeature, scrubContacts, type PermitRecord } from '../../src/sources/permits';
import { inPolygon } from '../../src/geo';
import { clipLine, clipPolygon } from '../clip';
import { everyCell, middleCell, piecesOf, type Placement } from '../placement';
import { gridCellOf } from '../../src/grid';
import { DC_BOROUGH } from '../../src/sources/dcGeocode';
import { createBlockIndex, permitStreet, type DcBlock } from './blocks';
import { classifyDcPermit, dcCompany } from './permits';
import { buildDcServices } from './services';
import { mainMaterial, type BuiltMainRow } from '../../src/sources/mains';
import type {
  dcBlockSchema,
  dcElevationSchema,
  dcHydrantSchema,
  dcLightSchema,
  dcLineSchema,
  dcMainSchema,
  dcOutfallSchema,
  dcPermitSchema,
  dcPointSchema,
  dcPolygonSchema,
  dcSignalSchema,
} from './datasets';

/**
 * Writes Washington, DC into the same cells as NYC, in the row shapes the app already reads:
 * Roadway Blocks become the street centerline, DC GIS planimetrics the ground, DDOT permits the
 * permit groups (one per block and utility), and point assets go in ready-made. See
 * docs/regions/dc.md.
 */

export interface DcBuildTools {
  shardDataset: <R>(name: SourceKey, place: (row: R) => Placement[], as?: string) => Promise<void>;
  readRows: (name: SourceKey) => AsyncIterable<unknown>;
  shards: { add: (cell: string, kind: string, row: unknown) => Promise<void> };
}

type Ring = [number, number][];

/** Twice the signed area; Esri writes outer rings clockwise (negative) and holes the other way. */
const signedArea = (ring: Ring) =>
  ring.reduce((sum, [x, y], i) => {
    const [nx, ny] = ring[(i + 1) % ring.length]!;
    return sum + (x * ny - nx * y);
  }, 0);

/** Esri rings as GeoJSON polygons: each hole goes with the outer ring around it. */
export const ringsToPolygons = (rings: Ring[]): Ring[][] => {
  const polygons: Ring[][] = [];
  const holes: Ring[] = [];
  for (const ring of rings) {
    if (ring.length < 4) continue;
    if (signedArea(ring) <= 0) polygons.push([ring]);
    else holes.push(ring);
  }
  for (const hole of holes) {
    const owner = polygons.find((polygon) => inPolygon(hole[0]!, [polygon[0]!]));
    owner?.push(hole);
  }
  return polygons;
};

const FEET_PER_METER = 3.28084;

// Permit text can run long; the card shows a line or two.
const PURPOSE_CHARS = 240;

const isoDate = (millis: number | null | undefined) =>
  millis ? new Date(millis).toISOString().slice(0, 10) : undefined;

export const asset = (
  kind: BuiltAssetRow['kind'],
  utility: BuiltAssetRow['utility'],
  title: string,
  facts: [string, string | null | undefined][],
  source: SourceKey,
  { x, y }: { x: number; y: number },
): BuiltAssetRow => ({
  kind,
  utility,
  title,
  facts: facts.filter((fact): fact is [string, string] => Boolean(fact[1]?.trim())),
  source,
  lngLat: [x, y],
});

export const buildDc = async ({ shardDataset, readRows, shards }: DcBuildTools) => {
  const blocks: DcBlock[] = [];
  await shardDataset(
    'dcBlocks',
    (row: z.infer<typeof dcBlockSchema>) => {
      const paths = row.geometry.paths;
      blocks.push({ key: row.BLOCKKEY, street: row.ROUTENAME, path: paths.flat() });
      const street = {
        full_street_name: row.ROUTENAME,
        borough: DC_BOROUGH,
        the_geom: { type: 'MultiLineString', coordinates: paths },
      };
      return everyCell(street, paths);
    },
    'centerline',
  );

  await shardDataset(
    'dcCurbs',
    (row: z.infer<typeof dcLineSchema>) =>
      piecesOf(row.geometry.paths, (lines, box) => {
        const coordinates = lines.flatMap((line) => clipLine(line, box));
        return coordinates.length ? { the_geom: { type: 'MultiLineString', coordinates } } : null;
      }),
    'curbs',
  );

  for (const [name, as] of [
    ['dcRoads', 'roadbed'],
    ['dcSidewalks', 'sidewalks'],
  ] as const)
    await shardDataset(
      name,
      (row: z.infer<typeof dcPolygonSchema>) =>
        piecesOf(ringsToPolygons(row.geometry.rings), (polygons, box) => {
          const coordinates = polygons
            .map((polygon) => clipPolygon(polygon, box))
            .filter((polygon) => polygon.length);
          return coordinates.length ? { the_geom: { type: 'MultiPolygon', coordinates } } : null;
        }),
      as,
    );

  // Kept by grid cell so the spot elevations on roofs can be found and left out below.
  const buildingsByCell = new Map<string, Ring[][]>();
  await shardDataset(
    'dcBuildings',
    (row: z.infer<typeof dcPolygonSchema>) => {
      const polygons = ringsToPolygons(row.geometry.rings);
      if (!polygons.length) return [];
      const placements = middleCell(
        { the_geom: { type: 'MultiPolygon', coordinates: polygons } },
        polygons,
      );
      for (const [cell] of placements) {
        const list = buildingsByCell.get(cell.key) ?? [];
        list.push(...polygons);
        buildingsByCell.set(cell.key, list);
      }
      return placements;
    },
    'buildings',
  );

  // DC's spot layer mixes the ground with rooftops and gives no codes to tell them apart, and a
  // roof next to a street would tilt its sewers. A spot inside a footprint is a roof.
  await shardDataset(
    'dcElevations',
    (row: z.infer<typeof dcElevationSchema>) => {
      const point: [number, number] = [row.geometry.x, row.geometry.y];
      const roofs = buildingsByCell.get(gridCellOf(point).key) ?? [];
      if (roofs.some((polygon) => inPolygon(point, polygon))) return [];
      return middleCell(
        {
          the_geom: { type: 'Point', coordinates: point },
          elevation: (row.ELEVATION * FEET_PER_METER).toFixed(2),
        },
        point,
      );
    },
    'elevations',
  );
  buildingsByCell.clear();

  const point = (row: { geometry: { x: number; y: number } }) => [row.geometry.x, row.geometry.y];
  await shardDataset(
    'dcHydrants',
    (row: z.infer<typeof dcHydrantSchema>) =>
      middleCell(
        asset(
          'hydrant',
          'water',
          'Fire hydrant',
          [
            ['DC Water asset', row.ASSETNUM],
            ['Location', row.LOCATIONDETAIL],
            [
              'Implies',
              'A water main nearby, typically under the roadway, with a branch line to the hydrant',
            ],
          ],
          'dcHydrants',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );
  await shardDataset(
    'dcInlets',
    (row: z.infer<typeof dcPointSchema>) =>
      middleCell(
        asset(
          'catch-basin',
          'sewer',
          'Storm drain inlet',
          [['Implies', 'A connection pipe from the inlet to the storm or combined sewer']],
          'dcInlets',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );
  await shardDataset(
    'dcOutfalls',
    (row: z.infer<typeof dcOutfallSchema>) =>
      middleCell(
        asset(
          'outfall',
          'sewer',
          'Storm sewer outfall',
          [
            ['Outfall', row.OUTFALL_ID_TEXT],
            ['Drains to', row.RECEIVING_WATERBODY],
            ['Pipe', [row.SIZE_, row.TYPE_MATERIAL].filter(Boolean).join(' ')],
          ],
          'dcOutfalls',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );
  await shardDataset(
    'dcLights',
    (row: z.infer<typeof dcLightSchema>) =>
      middleCell(
        asset(
          'street-lamp',
          'electric',
          'Street light',
          [
            ['Light ID', row.STREETLIGHTID],
            ['Pole', [row.POLEHEIGHT, row.POLETYPE].filter(Boolean).join(' ')],
            ['Implies', 'Fed by underground cable along the curb'],
          ],
          'dcLights',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );
  await shardDataset(
    'dcSignals',
    (row: z.infer<typeof dcSignalSchema>) =>
      middleCell(
        asset(
          'traffic-signal',
          'electric',
          row.INTERSECTIONNAME ?? 'Traffic signal',
          [
            ['Leading pedestrian interval', row.LPI],
            ['Accessible pedestrian signal', row.APS],
          ],
          'dcSignals',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );

  // Whole in every cell it crosses: clipped at cell edges, a main would get an end cap there.
  await shardDataset(
    'dcMains',
    (row: z.infer<typeof dcMainSchema>): Placement[] => {
      const main: BuiltMainRow = {
        id: `dc-${row.OBJECTID}`,
        diameter_in: row.DIAMT,
        material: mainMaterial(row.MATRL),
        installed_year: row.INSTALLDATE ? new Date(row.INSTALLDATE).getUTCFullYear() : null,
        the_geom: { type: 'MultiLineString', coordinates: row.geometry.paths },
      };
      return everyCell(main, row.geometry.paths);
    },
    'mains',
  );

  await buildDcServices(readRows, shards);

  return groupDcPermits(readRows('dcPermits'), blocks, shards);
};

/**
 * Groups DDOT's permits by block and utility, the way NYC's are, and files each group in the
 * cell under its middle. Returns how many groups there were.
 */
const groupDcPermits = async (
  rows: AsyncIterable<unknown>,
  blocks: DcBlock[],
  shards: DcBuildTools['shards'],
) => {
  const nearestBlock = createBlockIndex(blocks);
  const blockByKey = new Map(blocks.map((block) => [block.key, block]));
  const groups = new Map<string, { geometry: Geometry; records: Map<string, PermitRecord> }>();
  const counts = { read: 0, utility: 0, onBlock: 0 };
  for await (const raw of rows) {
    const row = raw as z.infer<typeof dcPermitSchema>;
    counts.read += 1;
    // Applications not yet issued may never be dug.
    if (!row.IssueDate || row.Longitude == null || row.Latitude == null) continue;
    const work = classifyDcPermit(row.TypeDetailNames, row.PermitteeName);
    if (!work.length) continue;
    counts.utility += 1;
    const lngLat: [number, number] = [row.Longitude, row.Latitude];
    const block = nearestBlock(lngLat, permitStreet(row.WorkLocationFullAddress));
    const place = block ? block.key : `${lngLat[0].toFixed(5)},${lngLat[1].toFixed(5)}`;
    const geometry: Geometry = block
      ? { type: 'LineString', coordinates: blockByKey.get(block.key)!.path }
      : { type: 'Point', coordinates: lngLat };
    if (block) counts.onBlock += 1;
    const company = dcCompany(row.PermitteeName);
    const permitNumber = row.PermitNumber ?? String(row.TrackingNumber ?? row.OBJECTID);
    for (const item of work) {
      const key = `${item.utility}|dc|${place}`;
      const group = groups.get(key) ?? { geometry, records: new Map() };
      // A permit listing several spots on one block counts once there.
      group.records.set(permitNumber, {
        permitNumber,
        utility: item.utility,
        type: item.detail,
        // A permittee that isn't a known utility can be a private person; their name stays out.
        permittee: company?.name ?? 'Other permit holder',
        issued: isoDate(row.IssueDate),
        workStart: isoDate(row.EffectiveDate),
        workEnd: isoDate(row.ExpirationDate),
        status: row.StatusDescription ?? undefined,
        street: row.WorkLocationFullAddress ?? '',
        purpose: scrubContacts(row.WorkDetail?.trim() ?? '').slice(0, PURPOSE_CHARS) || undefined,
        locationNote: undefined,
        mentionsMain: item.main,
        dataset: 'dcPermits',
      });
      groups.set(key, group);
    }
  }
  for (const [key, { geometry, records }] of groups) {
    const feature = permitGroupFeature(key, geometry, [...records.values()]);
    // A block files in the cell under its middle vertex, as NYC's do under their middle.
    const anchor =
      geometry.type === 'Point'
        ? geometry.coordinates
        : geometry.type === 'LineString'
          ? geometry.coordinates[Math.floor(geometry.coordinates.length / 2)]!
          : null;
    if (!anchor) continue;
    await shards.add(gridCellOf(anchor).key, 'permitGroups', feature);
  }
  console.log(
    `dcPermits: ${counts.utility.toLocaleString()} utility permits of ${counts.read.toLocaleString()} excavation rows, ${counts.onBlock.toLocaleString()} on a block (the rest at their point), ${groups.size.toLocaleString()} groups`,
  );
  return groups.size;
};
