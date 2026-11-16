import type { Geometry, Position } from 'geojson';
import type { z } from 'zod';
import { plausibleDepth } from '../depth';
import { permitGroupFeature, scrubContacts, type PermitRecord } from '../../src/sources/permits';
import { gridCellOf } from '../../src/grid';
import { SF_BOROUGH } from '../../src/sources/sfGeocode';
import { clipLine, clipPolygon } from '../clip';
import { everyCell, middleCell, piecesOf } from '../placement';
import { asset, type DcBuildTools } from '../dc/build';
import type { BuiltMainRow } from '../../src/sources/mains';
import { classifySfPermit } from './permits';
import type {
  sfBuildingSchema,
  sfHighHydrantSchema,
  sfLightSchema,
  sfLowHydrantSchema,
  sfNodeSchema,
  sfPermitSchema,
  sfShapeSchema,
  sfSewerMainSchema,
  sfSideSewerSchema,
  sfSewerNodeSchema,
  sfSignalSchema,
  sfStreetSchema,
} from './datasets';

/**
 * Writes San Francisco into the same cells as NYC and DC: Public Works' street segments become
 * the centerline, DataSF planimetrics the ground, street-use permits the permit groups (one per
 * block, by CNN, and utility), and point assets go in ready-made. See docs/regions/sf.md.
 */

// Drawn streets. Paper streets, freeways, park roads, private and pedestrian ways aren't where
// utilities run under a roadway.
export const DRAWN_LAYERS = /^STREETS(_TI|_YBI|_HUNTERSP)?$/;

// Permit text can run long; the card shows a line or two.
const PURPOSE_CHARS = 240;

const isoDate = (value: string | null | undefined) => value?.slice(0, 10) || undefined;
export const isActive = (value: boolean | string | null | undefined) =>
  value === true || value === 'True';

type Polygon = Position[][];

/** A Socrata shape as a list of polygons, whichever of the two polygon types it came as. */
const polygonsOf = (
  shape: { type: string; coordinates: unknown[] } | null | undefined,
): Polygon[] =>
  !shape
    ? []
    : shape.type === 'Polygon'
      ? [shape.coordinates as Polygon]
      : shape.type === 'MultiPolygon'
        ? (shape.coordinates as Polygon[])
        : [];

export const buildSf = async ({ shardDataset, readRows, shards }: DcBuildTools) => {
  // Every segment and node by CNN, retired ones too: old permits name blocks since renumbered.
  const segments = new Map<string, Position[]>();
  const nodes = new Map<string, Position>();
  await shardDataset(
    'sfStreets',
    (row: z.infer<typeof sfStreetSchema>) => {
      const line = row.line?.coordinates;
      if (!line?.length) return [];
      segments.set(row.cnn, line);
      if (!isActive(row.active) || !DRAWN_LAYERS.test(row.layer ?? '') || !row.streetname)
        return [];
      const street = {
        full_street_name: row.streetname,
        borough: SF_BOROUGH,
        the_geom: { type: 'MultiLineString', coordinates: [line] },
      };
      return everyCell(street, [line]);
    },
    'centerline',
  );
  for await (const raw of readRows('sfNodes')) {
    const row = raw as z.infer<typeof sfNodeSchema>;
    if (row.the_geom) nodes.set(row.cnn, row.the_geom.coordinates);
  }

  await shardDataset(
    'sfCurbs',
    (row: z.infer<typeof sfShapeSchema>) => {
      const shape = row.the_geom;
      const lines =
        shape?.type === 'LineString'
          ? [shape.coordinates as Position[]]
          : shape?.type === 'MultiLineString'
            ? (shape.coordinates as Position[][])
            : [];
      return piecesOf(lines, (all, box) => {
        const coordinates = all.flatMap((line) => clipLine(line as [number, number][], box));
        return coordinates.length ? { the_geom: { type: 'MultiLineString', coordinates } } : null;
      });
    },
    'curbs',
  );

  await shardDataset(
    'sfRoads',
    (row: z.infer<typeof sfShapeSchema>) =>
      piecesOf(polygonsOf(row.the_geom), (polygons, box) => {
        const coordinates = polygons
          .map((polygon) => clipPolygon(polygon as [number, number][][], box))
          .filter((polygon) => polygon.length);
        return coordinates.length ? { the_geom: { type: 'MultiPolygon', coordinates } } : null;
      }),
    'roadbed',
  );

  await shardDataset(
    'sfBuildings',
    (row: z.infer<typeof sfBuildingSchema>) => {
      const polygons = polygonsOf(row.shape);
      return polygons.length
        ? middleCell({ the_geom: { type: 'MultiPolygon', coordinates: polygons } }, polygons)
        : [];
    },
    'buildings',
  );

  const point = (row: { geometry: { x: number; y: number } }) => [row.geometry.x, row.geometry.y];

  // Manholes and catch basins carry the street's height at their rim, in feet on the city datum.
  // That's what the sewer flow needs; the datum doesn't matter, only which way is down.
  await shardDataset(
    'sfSewerNodes',
    (row: z.infer<typeof sfSewerNodeSchema>) =>
      row.RIM && (row.NODE_TYPE === 'MH' || row.NODE_TYPE === 'CB')
        ? middleCell(
            {
              the_geom: { type: 'Point', coordinates: point(row) },
              elevation: row.RIM.toFixed(2),
            },
            point(row),
          )
        : [],
    'elevations',
  );

  const sewerUse = (use: string | null | undefined) =>
    use === 'COMB'
      ? 'Combined sewer'
      : use === 'STORM' || use === 'MS4'
        ? 'Storm sewer'
        : use === 'SANI'
          ? 'Sanitary sewer'
          : null;
  await shardDataset(
    'sfSewerNodes',
    (row: z.infer<typeof sfSewerNodeSchema>) => {
      const depth =
        row.RIM && row.INVERT && row.RIM > row.INVERT
          ? `${(row.RIM - row.INVERT).toFixed(1)} ft from rim to invert`
          : null;
      const facts: [string, string | null | undefined][] = [
        ['Asset', row.MXASSETNUM],
        ['Location', row.LOCATION_DESC],
        ['Sewer', sewerUse(row.NODE_USE)],
        ['Depth', depth],
      ];
      const kind =
        row.NODE_TYPE === 'MH'
          ? (['manhole', 'Sewer manhole'] as const)
          : row.NODE_TYPE === 'CB'
            ? (['catch-basin', 'Catch basin'] as const)
            : row.NODE_TYPE === 'STORMOUTFA' || row.NODE_TYPE === 'OUTFALL'
              ? (['outfall', 'Sewer outfall'] as const)
              : null;
      if (!kind) return [];
      return middleCell(
        asset(kind[0], 'sewer', kind[1], facts, 'sfSewerNodes', row.geometry),
        point(row),
      );
    },
    'assets',
  );

  await shardDataset(
    'sfHydrantsLow',
    (row: z.infer<typeof sfLowHydrantSchema>) =>
      middleCell(
        asset(
          'hydrant',
          'water',
          'Fire hydrant',
          [
            ['Hydrant', row.hyd_id?.trim()],
            ['Pressure zone', row.pr_system?.trim()],
            [
              'Implies',
              'A water main nearby, typically under the roadway, with a branch line to the hydrant',
            ],
          ],
          'sfHydrantsLow',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );
  await shardDataset(
    'sfHydrantsHigh',
    (row: z.infer<typeof sfHighHydrantSchema>) =>
      middleCell(
        asset(
          'hydrant',
          'water',
          'High pressure fire hydrant',
          [
            ['Hydrant', row.hydrant_id?.trim()],
            [
              'Implies',
              'A main of the Auxiliary Water Supply System, the fire department’s separate high pressure network, nearby',
            ],
          ],
          'sfHydrantsHigh',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );
  await shardDataset(
    'sfLights',
    (row: z.infer<typeof sfLightSchema>) =>
      middleCell(
        asset(
          'street-lamp',
          'electric',
          'Street light',
          [
            ['Asset', row.assetnum],
            ['Pole', row.pole_type],
            ['Implies', 'Fed by underground cable along the curb'],
          ],
          'sfLights',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );
  await shardDataset(
    'sfSignals',
    (row: z.infer<typeof sfSignalSchema>) => {
      if (!row.shape) return [];
      const [x, y] = row.shape.coordinates as [number, number];
      const name = [row.street1, row.street2].filter(Boolean).join(' & ');
      return middleCell(
        asset(
          'traffic-signal',
          'electric',
          name || 'Traffic signal',
          [['Signal', row.type]],
          'sfSignals',
          { x, y },
        ),
        [x, y],
      );
    },
    'assets',
  );

  await buildSfSewers(readRows, shardDataset);

  return groupSfPermits(readRows('sfPermits'), segments, nodes, shards);
};

// SF Public Works' material codes.
const SEWER_MATERIALS: Record<string, string> = {
  VCP: 'Vitrified clay',
  ISP: 'Lined in place',
  HDPE: 'Plastic (HDPE)',
  'PERF HDPE': 'Plastic (HDPE)',
  RCP: 'Reinforced concrete',
  RC: 'Reinforced concrete',
  SRCP: 'Reinforced concrete',
  BRICK: 'Brick',
  'BRICK-GUNITE': 'Brick',
  DIP: 'Ductile iron',
  'CONC.BOX': 'Concrete box',
};

const SEWER_USES: Record<string, string> = {
  COMB: 'combined',
  STORM: 'storm',
  MS4: 'storm',
  SANI: 'sanitary',
};

/** Inches across, or tall for an egg-shaped or box sewer: `10"`, `3'-0" x 5'-0"`, `6'-6"`. */
export const sewerHeightIn = (size: string | null | undefined): number | null => {
  const last = size?.split('x').pop()?.trim();
  const match = last?.match(/^(?:(\d+)')?-?(?:(\d+(?:\.\d+)?)")?$/);
  if (!match || (!match[1] && !match[2])) return null;
  return Number(match[1] ?? 0) * 12 + Number(match[2] ?? 0);
};

// A main's end is at a manhole within this.
const NODE_REACH_M = 3;
const METERS_PER_DEGREE = 111_320;

/**
 * The city's sewer mains on their mapped routes, each at its measured depth: the rim and invert
 * of the manholes at its ends, less its own height, is the cover over it. Private, park and
 * state-owned sewers are left out; they aren't under the street.
 */
const buildSfSewers = async (
  readRows: DcBuildTools['readRows'],
  shardDataset: DcBuildTools['shardDataset'],
) => {
  // Manholes by a grid about 3 m square, to find a main's ends.
  const cellOf = ([x, y]: Position) =>
    `${Math.round((x! * METERS_PER_DEGREE * Math.cos((y! * Math.PI) / 180)) / NODE_REACH_M)},${Math.round((y! * METERS_PER_DEGREE) / NODE_REACH_M)}`;
  const nodes = new Map<string, { at: Position; depthFt: number }[]>();
  for await (const raw of readRows('sfSewerNodes')) {
    const row = raw as z.infer<typeof sfSewerNodeSchema>;
    if (!row.RIM || !row.INVERT || row.RIM <= row.INVERT) continue;
    const at = [row.geometry.x, row.geometry.y];
    const key = cellOf(at);
    nodes.set(key, [...(nodes.get(key) ?? []), { at, depthFt: row.RIM - row.INVERT }]);
  }
  const depthAt = (end: Position) => {
    const [i, j] = cellOf(end).split(',').map(Number) as [number, number];
    let best: { depthFt: number; distance: number } | null = null;
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++)
        for (const node of nodes.get(`${i + di},${j + dj}`) ?? []) {
          const distance =
            Math.hypot(
              (node.at[0]! - end[0]!) * Math.cos((end[1]! * Math.PI) / 180),
              node.at[1]! - end[1]!,
            ) * METERS_PER_DEGREE;
          if (distance <= NODE_REACH_M && (!best || distance < best.distance))
            best = { depthFt: node.depthFt, distance };
        }
    return best?.depthFt ?? null;
  };
  const counts = { mains: 0, measured: 0 };
  await shardDataset(
    'sfSewerMains',
    (row: z.infer<typeof sfSewerMainSchema>) => {
      if (row.OWNER !== 'PUC' && row.OWNER !== 'TI') return [];
      const paths = row.geometry.paths;
      const first = paths[0]?.[0];
      const lastPath = paths[paths.length - 1];
      const last = lastPath?.[lastPath.length - 1];
      if (!first || !last) return [];
      const heightIn = sewerHeightIn(row.PIPE_DIA);
      const inverts = [depthAt(first), depthAt(last)].filter((d): d is number => d !== null);
      // From the street to the top of the pipe.
      const coverFt = inverts.length
        ? inverts.reduce((sum, d) => sum + d, 0) / inverts.length - (heightIn ?? 12) / 12
        : null;
      counts.mains += 1;
      if (plausibleDepth(coverFt) !== null) counts.measured += 1;
      const main: BuiltMainRow = {
        id: `sf-${row.GID}`,
        utility: 'sewer',
        diameter_in: heightIn,
        material: (row.PIPE_MATRL && SEWER_MATERIALS[row.PIPE_MATRL]) ?? null,
        // The city files pipes of unknown age as 1840.
        installed_year: row.INT_YEAR && row.INT_YEAR !== 1840 ? row.INT_YEAR : null,
        depth_ft: plausibleDepth(coverFt),
        use: (row.PIPE_USE && SEWER_USES[row.PIPE_USE]) ?? null,
        source: 'sfSewerMains',
        the_geom: { type: 'MultiLineString', coordinates: paths },
      };
      return everyCell(main, paths);
    },
    'mains',
  );
  console.log(
    `sfSewerMains: ${counts.mains.toLocaleString()} city sewers, ${counts.measured.toLocaleString()} with a measured depth`,
  );

  // Each building's own sewer, from the building to the city's, on its recorded route. No depth
  // is recorded; the app draws it at the shallowest sewer depth.
  await shardDataset(
    'sfSideSewers',
    (row: z.infer<typeof sfSideSewerSchema>) => {
      const paths = row.geometry.paths;
      if (!paths.length) return [];
      const main: BuiltMainRow = {
        id: `sf-side-${row.GID}`,
        utility: 'sewer',
        diameter_in: sewerHeightIn(row.SIDESEW_DIA),
        material: (row.SIDESEW_MATL && SEWER_MATERIALS[row.SIDESEW_MATL]) ?? null,
        installed_year: null,
        depth_ft: null,
        use: 'side',
        address: row.ADDRESS?.trim() || null,
        source: 'sfSideSewers',
        the_geom: { type: 'MultiLineString', coordinates: paths },
      };
      return everyCell(main, paths);
    },
    'mains',
  );
};

/**
 * Groups the permits by CNN and utility. A CNN is a block (a street segment) or an intersection
 * (a node); a permit spanning several blocks has a row for each. Returns how many groups there were.
 */
const groupSfPermits = async (
  rows: AsyncIterable<unknown>,
  segments: Map<string, Position[]>,
  nodes: Map<string, Position>,
  shards: DcBuildTools['shards'],
) => {
  const groups = new Map<string, { geometry: Geometry; records: Map<string, PermitRecord> }>();
  const counts = { read: 0, utility: 0, assumed: 0, unplaced: 0 };
  for await (const raw of rows) {
    const row = raw as z.infer<typeof sfPermitSchema>;
    counts.read += 1;
    // Applications not yet approved may never be dug.
    if (!row.approved_date || !row.cnn) continue;
    const work = classifySfPermit(row.agent, row.permit_purpose);
    if (!work.length) continue;
    counts.utility += 1;
    const segment = segments.get(row.cnn);
    const node = segment ? undefined : nodes.get(row.cnn);
    const geometry: Geometry | null = segment
      ? { type: 'LineString', coordinates: segment }
      : node
        ? { type: 'Point', coordinates: node }
        : null;
    if (!geometry) {
      counts.unplaced += 1;
      continue;
    }
    const between = [row.cross_street_1, row.cross_street_2].filter(Boolean).join(' and ');
    for (const item of work) {
      if (item.assumed) counts.assumed += 1;
      const key = `${item.utility}|sf|${row.cnn}`;
      const group = groups.get(key) ?? { geometry, records: new Map() };
      group.records.set(row.permit_number, {
        permitNumber: row.permit_number,
        utility: item.utility,
        type: item.assumed
          ? `${row.permit_type ?? 'Excavation'}, gas or electric not stated`
          : (row.permit_type ?? 'Excavation'),
        permittee: item.owner,
        issued: isoDate(row.approved_date),
        workStart: isoDate(row.permit_start_date),
        workEnd: isoDate(row.permit_end_date),
        status: row.status ?? undefined,
        street: [row.streetname, between].filter(Boolean).join(' between '),
        purpose:
          scrubContacts(row.permit_purpose?.trim() ?? '').slice(0, PURPOSE_CHARS) || undefined,
        locationNote: undefined,
        mentionsMain: item.main,
        dataset: 'sfPermits',
      });
      groups.set(key, group);
    }
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
    `sfPermits: ${counts.utility.toLocaleString()} utility rows of ${counts.read.toLocaleString()}, ${counts.assumed.toLocaleString()} PG&E rows filed as gas without saying, ${counts.unplaced.toLocaleString()} on no known block, ${groups.size.toLocaleString()} groups`,
  );
  return groups.size;
};
