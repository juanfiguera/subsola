import type { Geometry } from 'geojson';
import type { z } from 'zod';
import { permitGroupFeature, type PermitRecord } from '../../src/sources/permits';
import { gridCellOf } from '../../src/grid';
import { DEN_BOROUGH } from '../../src/sources/denGeocode';
import type { BuiltMainRow } from '../../src/sources/mains';
import { everyCell, middleCell } from '../placement';
import { asset, ringsToPolygons, type DcBuildTools } from '../dc/build';
import { createBlockIndex, type DcBlock } from '../dc/blocks';
import { classifyDenPermit } from './permits';
import { addRim, denMaterial, denOwner, denPipeCover, denPipeSize, type Rims } from './sewers';
import { buildDenServices } from './services';
import type {
  denInletSchema,
  denManholeSchema,
  denPermitSchema,
  denPolygonSchema,
  denSewerSchema,
  denSignalSchema,
  denStormDrainSchema,
  denStreetSchema,
} from './datasets';

/**
 * Writes the City and County of Denver into the same cells as the other cities: its street
 * centerlines and building outlines, street occupancy permits that cut the street for a utility,
 * grouped by block and utility, Wastewater Management's sanitary sewers and storm drains at the
 * depths their manholes give, Denver Water's lead service line inventory by address, and point
 * assets ready-made. See docs/regions/den.md.
 */

// Flat meters around the middle of the city, for finding a permit's block.
const DEN_MIDDLE: [number, number] = [-104.95, 39.74];

// The permit layer carries placeholder dates: years like 1902 and 2901 are typing slips.
const FIRST_YEAR = 2010;
const LAST_YEAR = new Date().getUTCFullYear() + 3;

const isoDate = (millis: number | null | undefined) => {
  if (!millis) return undefined;
  const date = new Date(millis);
  const year = date.getUTCFullYear();
  return year >= FIRST_YEAR && year <= LAST_YEAR ? date.toISOString().slice(0, 10) : undefined;
};

const yearOf = (millis: number | null | undefined) => {
  const year = millis ? new Date(millis).getUTCFullYear() : 0;
  return year > 1800 && year <= new Date().getUTCFullYear() ? year : null;
};

/**
 * One closure row's dates, merged into the permit's record so far: a permit closing several
 * stretches of a block runs from its earliest start. The layer has no issue date, only the
 * closure's BEGIN_DATE and END_DATE, so `issued` is left out.
 */
export const denPermitDates = (
  row: { BEGIN_DATE?: number | null; END_DATE?: number | null },
  existing?: Pick<PermitRecord, 'workStart' | 'workEnd'>,
): Pick<PermitRecord, 'workStart' | 'workEnd'> => {
  const start = isoDate(row.BEGIN_DATE);
  const earlier = existing?.workStart;
  return {
    workStart: earlier && (!start || earlier < start) ? earlier : start,
    workEnd: isoDate(row.END_DATE) ?? existing?.workEnd,
  };
};

// "N YORK ST" and the like, as people write them: "York St".
const tidy = (name: string) =>
  name
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_, space: string, letter: string) => space + letter.toUpperCase());

const point = (row: { geometry: { x: number; y: number } }) => [row.geometry.x, row.geometry.y];

export const buildDen = async ({ shardDataset, readRows, shards }: DcBuildTools) => {
  const blocks: DcBlock[] = [];
  // The cells the city's own streets reach. Denver Water's inventory covers the suburbs too, and
  // only its points in these cells are kept.
  const cityCells = new Set<string>();
  await shardDataset(
    'denStreets',
    (row: z.infer<typeof denStreetSchema>) => {
      const paths = row.geometry.paths;
      const name = row.FULLNAME?.trim();
      if (!paths.length || !name) return [];
      blocks.push({ key: String(row.OBJECTID), street: name, path: paths.flat() });
      const placements = everyCell(
        {
          full_street_name: name,
          borough: DEN_BOROUGH,
          the_geom: { type: 'MultiLineString', coordinates: paths },
        },
        paths,
      );
      for (const [cell] of placements) cityCells.add(cell.key);
      return placements;
    },
    'centerline',
  );

  await shardDataset(
    'denBuildings',
    (row: z.infer<typeof denPolygonSchema>) => {
      const polygons = ringsToPolygons(row.geometry.rings as [number, number][][]);
      return polygons.length
        ? middleCell({ the_geom: { type: 'MultiPolygon', coordinates: polygons } }, polygons)
        : [];
    },
    'buildings',
  );

  // Manhole grounds give the street's height, in feet, and each pipe the depth at its ends. Most
  // come from a terrain model rather than a survey of the lid.
  const rims: Rims = new Map();
  for (const name of ['denSewerManholes', 'denStormManholes'] as const)
    await shardDataset(
      name,
      (row: z.infer<typeof denManholeSchema>) => {
        addRim(rims, row.assetid, row.ground_elevation);
        const ground = row.assetid ? rims.get(row.assetid.trim()) : undefined;
        return ground
          ? middleCell(
              {
                the_geom: { type: 'Point', coordinates: point(row) },
                elevation: ground.toFixed(2),
              },
              point(row),
            )
          : [];
      },
      'elevations',
    );

  const manholeAsset = (storm: boolean) => (row: z.infer<typeof denManholeSchema>) => {
    const ground = row.assetid ? rims.get(row.assetid.trim()) : undefined;
    const depth = ground && row.invert_1 && ground > row.invert_1 ? ground - row.invert_1 : null;
    return middleCell(
      asset(
        'manhole',
        'sewer',
        storm ? 'Storm manhole' : 'Sanitary manhole',
        [
          ['Manhole', row.assetid],
          ['Depth to invert', depth && depth < 60 ? `${depth.toFixed(1)} ft` : null],
          ['Owner', denOwner(row.ownedby)],
          ['Implies', storm ? 'A storm drain below' : 'A sanitary sewer below'],
        ],
        storm ? 'denStormManholes' : 'denSewerManholes',
        row.geometry,
      ),
      point(row),
    );
  };
  await shardDataset('denSewerManholes', manholeAsset(false), 'assets');
  await shardDataset('denStormManholes', manholeAsset(true), 'assets');

  // Inlets rarely record their ground, but where they do, a storm drain ending there uses it.
  await shardDataset(
    'denInlets',
    (row: z.infer<typeof denInletSchema>) => {
      addRim(rims, row.assetid, row.ground_elevation);
      return middleCell(
        asset(
          'catch-basin',
          'sewer',
          'Storm inlet',
          [
            ['Inlet', row.assetid],
            ['Owner', denOwner(row.ownedby)],
            [
              'Implies',
              'A pipe from the inlet to the storm drain; Denver keeps runoff out of its sanitary sewers',
            ],
          ],
          'denInlets',
          row.geometry,
        ),
        point(row),
      );
    },
    'assets',
  );

  const counts = { sewers: 0, sewersMeasured: 0, drains: 0, drainsMeasured: 0 };
  await shardDataset(
    'denSewers',
    (row: z.infer<typeof denSewerSchema>) => {
      const paths = row.geometry.paths.filter((path) => path.length > 1);
      if (!paths.length) return [];
      const size = denPipeSize(row.diameter, null);
      const depth = denPipeCover(
        rims,
        [
          [row.upstream_node_id, row.upelev],
          [row.downstream_node_id, row.downelev],
        ],
        size ?? 8,
      );
      counts.sewers += 1;
      if (depth !== null) counts.sewersMeasured += 1;
      const owner = denOwner(row.ownedby);
      const main: BuiltMainRow = {
        id: `den-${row.OBJECTID}`,
        utility: 'sewer',
        diameter_in: size,
        material: denMaterial(row.material),
        installed_year: yearOf(row.installdate),
        depth_ft: depth,
        use: row.unittype === 'Interceptor' ? 'trunk' : 'sanitary',
        ...(owner ? { owner } : {}),
        source: 'denSewers',
        the_geom: { type: 'MultiLineString', coordinates: paths },
      };
      return everyCell(main, paths);
    },
    'mains',
  );

  await shardDataset(
    'denStormDrains',
    (row: z.infer<typeof denStormDrainSchema>) => {
      const paths = row.geometry.paths.filter((path) => path.length > 1);
      if (!paths.length) return [];
      const size = denPipeSize(row.width, row.height);
      const depth = denPipeCover(
        rims,
        [
          [row.upstream_nodeid, row.upelev],
          [row.downstream_nodeid, row.downelev],
        ],
        size,
      );
      counts.drains += 1;
      if (depth !== null) counts.drainsMeasured += 1;
      const owner = denOwner(row.ownedby);
      const material = denMaterial(row.material);
      const main: BuiltMainRow = {
        id: `dend-${row.OBJECTID}`,
        utility: 'sewer',
        diameter_in: size,
        // A culvert or a box says so; Denver's pipe shapes are C (round), R, O, E and so on.
        material: row.ASSETGROUP === 6 ? (material ? `${material} culvert` : 'Culvert') : material,
        installed_year: yearOf(row.installdate),
        depth_ft: depth,
        use: 'storm',
        ...(owner ? { owner } : {}),
        source: 'denStormDrains',
        the_geom: { type: 'MultiLineString', coordinates: paths },
      };
      return everyCell(main, paths);
    },
    'mains',
  );
  rims.clear();
  console.log(
    `denSewers: ${counts.sewers.toLocaleString()} sanitary sewers, ${counts.sewersMeasured.toLocaleString()} with a measured depth; denStormDrains: ${counts.drains.toLocaleString()} storm drains, ${counts.drainsMeasured.toLocaleString()} with a measured depth`,
  );

  await buildDenServices(readRows, shards, cityCells);

  await shardDataset(
    'denSignals',
    (row: z.infer<typeof denSignalSchema>) =>
      middleCell(
        asset(
          'traffic-signal',
          'electric',
          'Traffic signal',
          [
            ['Signal', row.TRAFFIC_SIGNAL_ID ? String(row.TRAFFIC_SIGNAL_ID) : null],
            ['Owner', row.SIGNAL_OWNER === 'CCD' ? 'City and County of Denver' : row.SIGNAL_OWNER],
          ],
          'denSignals',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );

  return groupDenPermits(readRows('denPermits'), blocks, shards);
};

// Denver's purposes in words that survive the app's title case ("ROW" would read "Row").
const PURPOSE_WORDS: Record<string, string> = {
  'ROW Construction': 'Right of way construction',
  'Boring and/or Wells': 'Boring',
  'Miscellaneous - Multi-Categories': 'Several kinds of work',
};

/** Groups the permits by block and utility, as the other cities' are. Returns how many groups. */
const groupDenPermits = async (
  rows: AsyncIterable<unknown>,
  blocks: DcBlock[],
  shards: DcBuildTools['shards'],
) => {
  const nearestBlock = createBlockIndex(blocks, DEN_MIDDLE);
  const blockByKey = new Map(blocks.map((block) => [block.key, block]));
  const groups = new Map<string, { geometry: Geometry; records: Map<string, PermitRecord> }>();
  const counts = {
    read: 0,
    rejected: 0,
    noPlace: 0,
    utility: 0,
    assumed: 0,
    onBlock: 0,
    byUtility: {} as Record<string, number>,
  };
  for await (const raw of rows) {
    const row = raw as z.infer<typeof denPermitSchema>;
    counts.read += 1;
    const work = classifyDenPermit(row.PURPOSE, row.COMPANY);
    if (!work || !row.PERMIT_NUMBER) {
      counts.rejected += 1;
      continue;
    }
    const path = row.geometry?.paths.flat();
    const middle = path?.length ? path[Math.floor(path.length / 2)] : undefined;
    if (!middle) {
      counts.noPlace += 1;
      continue;
    }
    counts.utility += 1;
    counts.byUtility[work.utility] = (counts.byUtility[work.utility] ?? 0) + 1;
    if (work.assumed) counts.assumed += 1;
    // The closure runs along the street the permit names; its middle finds the block.
    const at: [number, number] = [middle[0]!, middle[1]!];
    const block = nearestBlock(at, row.STREET?.trim() ?? null);
    if (block) counts.onBlock += 1;
    const place = block ? block.key : `${at[0].toFixed(5)},${at[1].toFixed(5)}`;
    const geometry: Geometry = block
      ? { type: 'LineString', coordinates: blockByKey.get(block.key)!.path }
      : { type: 'Point', coordinates: at };
    const key = `${work.utility}|den|${place}`;
    const group = groups.get(key) ?? { geometry, records: new Map() };
    const street = row.STREET?.trim()
      ? [
          tidy(row.STREET.trim()),
          [row.FROM_STREET, row.TO_STREET]
            .map((name) => name?.trim())
            .filter(Boolean)
            .map((name) => tidy(name!))
            .join(' and '),
        ]
          .filter(Boolean)
          .join(' between ')
      : '';
    // Denver's own pick list, never free text, so it names the kind of permit rather than being
    // quoted as a crew's words.
    const purpose = row.PURPOSE?.trim();
    const kind = (purpose && (PURPOSE_WORDS[purpose] ?? purpose)) || 'Street occupancy permit';
    // A permit closing several stretches of one block is one record.
    const existing = group.records.get(row.PERMIT_NUMBER);
    group.records.set(row.PERMIT_NUMBER, {
      permitNumber: row.PERMIT_NUMBER,
      utility: work.utility,
      type: work.assumed ? `${kind}, gas or electric not stated` : kind,
      permittee: work.owner,
      ...denPermitDates(row, existing),
      status: undefined,
      street,
      purpose: undefined,
      locationNote: undefined,
      mentionsMain: false,
      dataset: 'denPermits',
    });
    groups.set(key, group);
  }
  for (const [key, { geometry, records }] of groups) {
    const feature = permitGroupFeature(key, geometry, [...records.values()]);
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
    `denPermits: ${counts.utility.toLocaleString()} utility dig rows of ${counts.read.toLocaleString()} (${counts.rejected.toLocaleString()} not a utility dig, ${counts.noPlace} with no shape), by utility ${JSON.stringify(counts.byUtility)}, ${counts.assumed.toLocaleString()} Xcel filed as gas without saying, ${counts.onBlock.toLocaleString()} on a block, ${groups.size.toLocaleString()} groups`,
  );
  return groups.size;
};
