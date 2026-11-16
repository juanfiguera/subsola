import type { Geometry, Position } from 'geojson';
import type { z } from 'zod';
import { plausibleDepth } from '../depth';
import { permitGroupFeature, type PermitRecord } from '../../src/sources/permits';
import { gridCellOf } from '../../src/grid';
import { LA_BOROUGH } from '../../src/sources/laGeocode';
import type { BuiltMainRow } from '../../src/sources/mains';
import { clipPolygon } from '../clip';
import { everyCell, middleCell, piecesOf } from '../placement';
import { asset, ringsToPolygons, type DcBuildTools } from '../dc/build';
import { createBlockIndex, permitStreet, type DcBlock } from '../dc/blocks';
import { endKey, stormDrainCover } from '../sd/drains';
import { classifyLaPermit } from './permits';
import {
  createLidIndex,
  laStormDrainMaterial,
  laStormDrainOwner,
  laStormDrainSizeIn,
} from './drains';
import type {
  laHydrantSchema,
  laInletSchema,
  laLightSchema,
  laPermitLineSchema,
  laPermitPointSchema,
  laPermitPolygonSchema,
  laPolygonSchema,
  laSewerSchema,
  laSideSewerSchema,
  laSignalSchema,
  laStormDrainSchema,
  laStreetSchema,
  laStructureSchema,
} from './datasets';

/**
 * Writes the City of Los Angeles into the same cells as the other cities: the Bureau of
 * Engineering's centerline, LARIAC building footprints, StreetsLA's sidewalks, excavation permits
 * grouped by block and utility, LA Sanitation's sewers and storm drains at their measured depth,
 * its house connections on their mapped routes, and point assets ready-made. See
 * docs/regions/la.md.
 */

// Flat meters around the middle of the city, for finding a permit's block.
const LA_MIDDLE: [number, number] = [-118.41, 34.02];

// A sewer lid this close to a storm drain's end gives the street's height there.
const LID_REACH_M = 10;

// Layers mark a missing elevation with -99.
const hasElevation = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined && value > 0;

const isoDate = (millis: number | null | undefined) =>
  millis && millis > 0 ? new Date(millis).toISOString().slice(0, 10) : undefined;

/**
 * A permit's dates. The layers carry no issue date: StartDate and EndDate are the window the
 * street may be open, and EnterDate is when the row was typed in (years after the work for the
 * archived points and lines), so `issued` is left out.
 */
export const laPermitDates = (row: {
  StartDate?: number | null;
  EndDate?: number | null;
}): Pick<PermitRecord, 'workStart' | 'workEnd'> => ({
  workStart: isoDate(row.StartDate),
  workEnd: isoDate(row.EndDate),
});

/** A permit or reference number the city actually filled in: not empty, and not a bare 0. */
const realNumber = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text && !/^0+$/.test(text) ? text : null;
};

/**
 * A permit's number, which also keys it on its block so one permit's several dig spots count
 * once. About 38,000 rows say PermitNo 0, and keying on that merged every one of them on a block
 * into a single permit. Those fall back to RefNo, then to the row's own ID, tagged with its layer
 * because IDs repeat from one layer to the next.
 */
export const laPermitNumber = (
  row: { ID: number; PermitNo?: string | number | null; RefNo?: string | number | null },
  layer: string,
) => realNumber(row.PermitNo) ?? realNumber(row.RefNo) ?? `${layer}-${row.ID}`;

// LA Sanitation's material codes.
const SEWER_MATERIALS: Record<string, string> = {
  VCP: 'Vitrified clay',
  CON: 'Concrete',
  RCP: 'Reinforced concrete',
  PVC: 'PVC',
  HDPE: 'Plastic (HDPE)',
  DIP: 'Ductile iron',
  CIP: 'Cast iron',
  BRK: 'Brick',
  ABS: 'ABS plastic',
};

type Permit = z.infer<typeof laPermitPolygonSchema>;

/** Where a permit's dig was: a dig spot's middle, a point, or a line's middle vertex. */
const permitPoint = (geometry: unknown): Position | null => {
  const shape = geometry as { rings?: number[][][]; x?: number; y?: number; paths?: number[][][] };
  if (shape.rings?.[0]?.length) {
    const ring = shape.rings[0];
    const sum = ring.reduce((total, [x, y]) => [total[0]! + x!, total[1]! + y!], [0, 0]);
    return [sum[0]! / ring.length, sum[1]! / ring.length];
  }
  if (shape.x !== undefined && shape.y !== undefined) return [shape.x, shape.y];
  const path = shape.paths?.[0];
  return path?.length ? path[Math.floor(path.length / 2)]! : null;
};

/** "19150 Harnett St. and Vanalden Ave." or "3401 Riverside Dr, Los Angeles, CA and ..." to "Harnett St". */
export const laPermitStreet = (location: string | null | undefined) =>
  permitStreet(
    location
      ?.split(/\s+and\s+|,/i)[0]
      ?.replace(/\./g, '')
      .trim(),
  );

export const buildLa = async ({ shardDataset, readRows, shards }: DcBuildTools) => {
  const blocks: DcBlock[] = [];
  await shardDataset(
    'laStreets',
    (row: z.infer<typeof laStreetSchema>) => {
      const paths = row.geometry.paths;
      const name = [row.TDIR, row.STNAME, row.STSFX].filter(Boolean).join(' ');
      if (!paths.length || !row.STNAME) return [];
      blocks.push({
        // Unnumbered and private sections share the labels "none" and "private", which would
        // pile every such section's permits onto one block.
        key:
          row.SECT_ID && !/^(none|private)$/i.test(String(row.SECT_ID))
            ? String(row.SECT_ID)
            : `${paths[0]![0]}`,
        street: name,
        path: paths.flat() as [number, number][],
      });
      return everyCell(
        {
          full_street_name: name,
          borough: LA_BOROUGH,
          the_geom: { type: 'MultiLineString', coordinates: paths },
        },
        paths,
      );
    },
    'centerline',
  );

  await shardDataset(
    'laBuildings',
    (row: z.infer<typeof laPolygonSchema>) => {
      const polygons = ringsToPolygons(row.geometry.rings as [number, number][][]);
      return polygons.length
        ? middleCell({ the_geom: { type: 'MultiPolygon', coordinates: polygons } }, polygons)
        : [];
    },
    'buildings',
  );

  // Ground for the low views; each sidewalk is a piece in front of one parcel.
  await shardDataset(
    'laSidewalks',
    (row: z.infer<typeof laPolygonSchema>) =>
      piecesOf(ringsToPolygons(row.geometry.rings as [number, number][][]), (polygons, box) => {
        const coordinates = polygons
          .map((polygon) => clipPolygon(polygon, box))
          .filter((polygon) => polygon.length);
        return coordinates.length ? { the_geom: { type: 'MultiPolygon', coordinates } } : null;
      }),
    'sidewalks',
  );

  const point = (row: { geometry: { x: number; y: number } }) => [row.geometry.x, row.geometry.y];

  // Maintenance hole lids give the street's height, in feet; only which way is down matters.
  const lids = new Map<number, number>();
  // The same lids by place, for the storm drains, whose own structures rarely record one.
  const sewerLids = createLidIndex(LID_REACH_M);
  await shardDataset(
    'laSewerStructures',
    (row: z.infer<typeof laStructureSchema>) => {
      if (!hasElevation(row.LID_ELEV)) return [];
      if (row.STRUCTURE_ID) lids.set(row.STRUCTURE_ID, row.LID_ELEV);
      sewerLids.add(point(row), row.LID_ELEV);
      return middleCell(
        {
          the_geom: { type: 'Point', coordinates: point(row) },
          elevation: row.LID_ELEV.toFixed(2),
        },
        point(row),
      );
    },
    'elevations',
  );
  await shardDataset(
    'laSewerStructures',
    (row: z.infer<typeof laStructureSchema>) => {
      const depth = Number(row.MH_DEPTH);
      return middleCell(
        asset(
          'manhole',
          'sewer',
          'Sewer maintenance hole',
          [
            ['Structure', row.STRUCTURE_ID ? String(row.STRUCTURE_ID) : null],
            ['Street', row.STREET1],
            ['Depth', depth > 0 ? `${depth.toFixed(1)} ft` : null],
          ],
          'laSewerStructures',
          row.geometry,
        ),
        point(row),
      );
    },
    'assets',
  );

  // Each pipe at its measured depth: the lid at either end, less the invert there, less the
  // pipe's own height.
  const counts = { sewers: 0, measured: 0 };
  await shardDataset(
    'laSewers',
    (row: z.infer<typeof laSewerSchema>) => {
      const paths = row.geometry.paths;
      if (!paths.length) return [];
      const heightFt = (row.PIPE_SIZE ?? 8) / 12;
      const ends = [
        [row.UP_STRUCT, row.UP_INV],
        [row.DN_STRUCT, row.DN_INV],
      ].flatMap(([structure, invert]) => {
        const lid = structure ? lids.get(structure) : undefined;
        return lid !== undefined && hasElevation(invert) && lid > invert ? [lid - invert] : [];
      });
      const cover = ends.length
        ? ends.reduce((sum, depth) => sum + depth, 0) / ends.length - heightFt
        : null;
      counts.sewers += 1;
      if (plausibleDepth(cover) !== null) counts.measured += 1;
      const year = Number(row.YEAR_INST);
      const main: BuiltMainRow = {
        id: `la-${row.OBJECTID}`,
        utility: 'sewer',
        diameter_in: row.PIPE_SIZE ?? null,
        material: (row.PIPE_MAT && SEWER_MATERIALS[row.PIPE_MAT]) ?? null,
        installed_year: year > 1800 ? year : null,
        depth_ft: plausibleDepth(cover),
        use: 'sanitary',
        source: 'laSewers',
        the_geom: { type: 'MultiLineString', coordinates: paths },
      };
      return everyCell(main, paths);
    },
    'mains',
  );
  lids.clear();
  console.log(
    `laSewers: ${counts.sewers.toLocaleString()} sewers, ${counts.measured.toLocaleString()} with a measured depth`,
  );

  // Each house connection from the sewer to the property line, on the route LA Sanitation maps.
  // The layer records nothing else, not even the address it serves; the app draws it at the
  // shallowest depth the city's sewers allow.
  await shardDataset(
    'laSideSewers',
    (row: z.infer<typeof laSideSewerSchema>) => {
      const paths = row.geometry.paths;
      if (!paths.length) return [];
      const main: BuiltMainRow = {
        id: `la-side-${row.OBJECTID}`,
        utility: 'sewer',
        diameter_in: null,
        material: null,
        installed_year: null,
        depth_ft: null,
        use: 'side',
        source: 'laSideSewers',
        the_geom: { type: 'MultiLineString', coordinates: paths },
      };
      return everyCell(main, paths);
    },
    'mains',
  );

  await shardDataset(
    'laHydrants',
    (row: z.infer<typeof laHydrantSchema>) =>
      middleCell(
        asset(
          'hydrant',
          'water',
          'Fire hydrant',
          [
            ['Hydrant', row.HYDRTS_ID == null ? null : String(row.HYDRTS_ID)],
            ['Outlets', row.SIZE_CODE],
            [
              'Implies',
              'A water main nearby, typically under the roadway, with a branch line to the hydrant',
            ],
          ],
          'laHydrants',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );
  // Storm structure lids by the point the storm drains are drawn to. Of the structures, only
  // catch basins and maintenance holes are drawn: junctions, transitions and outlets are
  // fittings on the pipe with nothing to see at the street.
  const stormLids = new Map<string, number>();
  await shardDataset(
    'laInlets',
    (row: z.infer<typeof laInletSchema>) => {
      if (hasElevation(row.LID_ELEV)) stormLids.set(endKey(point(row)), row.LID_ELEV);
      const facts: [string, string | null][] = [
        ['Asset', row.ASSETID == null ? null : String(row.ASSETID)],
        ['Maintained by', row.MAINTAINED_BY ?? null],
      ];
      if (row.DESCRIPTION === 'Catch Basin')
        return middleCell(
          asset(
            'catch-basin',
            'sewer',
            'Catch basin',
            [
              ...facts,
              [
                'Implies',
                'A pipe from the basin to the storm drain; LA keeps runoff out of its sewers',
              ],
            ],
            'laInlets',
            row.geometry,
          ),
          point(row),
        );
      if (row.DESCRIPTION === 'Storm Drain Maintenance Hole')
        return middleCell(
          asset(
            'manhole',
            'sewer',
            'Storm drain maintenance hole',
            facts,
            'laInlets',
            row.geometry,
          ),
          point(row),
        );
      return [];
    },
    'assets',
  );

  // Each storm drain at its measured depth where an end has a lid close by: the storm
  // structure's own at that point, else the nearest sewer maintenance hole's.
  const drains = { pipes: 0, measured: 0 };
  await shardDataset(
    'laStormDrains',
    (row: z.infer<typeof laStormDrainSchema>) => {
      const paths = row.geometry.paths;
      const first = paths[0]?.[0];
      const last = paths.at(-1)?.at(-1);
      if (!first || !last) return [];
      const sizeIn = laStormDrainSizeIn(row.DIAMETER_HEIGHT, row.PIPESHAPE_DESC);
      const rimAt = (end: number[]) => stormLids.get(endKey(end)) ?? sewerLids.nearest(end);
      const depth = stormDrainCover(
        [
          [rimAt(first), hasElevation(row.UP_ELEV) ? row.UP_ELEV : null],
          [rimAt(last), hasElevation(row.DN_ELEV) ? row.DN_ELEV : null],
        ],
        sizeIn,
      );
      drains.pipes += 1;
      if (depth !== null) drains.measured += 1;
      const owner = laStormDrainOwner(row.OWNER_DESC);
      const main: BuiltMainRow = {
        id: `la-storm-${row.OBJECTID}`,
        utility: 'sewer',
        diameter_in: sizeIn,
        material: laStormDrainMaterial(row.MATERIAL_DESC),
        installed_year: null,
        depth_ft: depth,
        use: 'storm',
        ...(owner ? { owner } : {}),
        source: 'laStormDrains',
        the_geom: { type: 'MultiLineString', coordinates: paths },
      };
      return everyCell(main, paths);
    },
    'mains',
  );
  stormLids.clear();
  console.log(
    `laStormDrains: ${drains.pipes.toLocaleString()} pipes, ${drains.measured.toLocaleString()} with a measured depth`,
  );
  await shardDataset(
    'laLights',
    (row: z.infer<typeof laLightSchema>) =>
      middleCell(
        asset(
          'street-lamp',
          'electric',
          'Street light',
          [
            ['Light', row.STLID],
            ['Pole', row.POSTDESC],
            ['Lamp', row.LAMPA],
            ['Implies', 'Fed by underground cable along the curb'],
          ],
          'laLights',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );
  await shardDataset(
    'laSignals',
    (row: z.infer<typeof laSignalSchema>) =>
      middleCell(
        asset(
          'traffic-signal',
          'electric',
          [row.ST1, row.ST2].filter(Boolean).join(' & ') || 'Traffic signal',
          [],
          'laSignals',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );

  return groupLaPermits(
    [
      { layer: 'active', rows: readRows('laPermitsActive') },
      { layer: 'archived', rows: readRows('laPermitsArchived') },
      { layer: 'point', rows: readRows('laPermitsPoints') },
      { layer: 'line', rows: readRows('laPermitsLines') },
    ],
    blocks,
    shards,
  );
};

/** Groups the permits by block and utility, as the other cities' are. Returns how many groups. */
const groupLaPermits = async (
  sources: { layer: string; rows: AsyncIterable<unknown> }[],
  blocks: DcBlock[],
  shards: DcBuildTools['shards'],
) => {
  const nearestBlock = createBlockIndex(blocks, LA_MIDDLE);
  const blockByKey = new Map(blocks.map((block) => [block.key, block]));
  const groups = new Map<string, { geometry: Geometry; records: Map<string, PermitRecord> }>();
  const counts = { read: 0, utility: 0, assumed: 0, onBlock: 0 };
  for (const { layer, rows } of sources)
    for await (const raw of rows) {
      const row = raw as
        Permit | z.infer<typeof laPermitPointSchema> | z.infer<typeof laPermitLineSchema>;
      counts.read += 1;
      const work = classifyLaPermit(row.ContactEmail);
      const at = permitPoint(row.geometry);
      if (!work || !at) continue;
      counts.utility += 1;
      if (work.assumed) counts.assumed += 1;
      const block = nearestBlock(at as [number, number], laPermitStreet(row.Location));
      const place = block ? block.key : `${at[0]!.toFixed(5)},${at[1]!.toFixed(5)}`;
      const geometry: Geometry = block
        ? { type: 'LineString', coordinates: blockByKey.get(block.key)!.path }
        : { type: 'Point', coordinates: at };
      if (block) counts.onBlock += 1;
      const permitNumber = laPermitNumber(row, layer);
      const key = `${work.utility}|la|${place}`;
      const group = groups.get(key) ?? { geometry, records: new Map() };
      // A permit's several dig spots on one block count once there.
      group.records.set(permitNumber, {
        permitNumber,
        utility: work.utility,
        type: work.assumed
          ? 'Excavation (U) permit, water or power not stated'
          : 'Excavation (U) permit',
        permittee: work.owner,
        ...laPermitDates(row),
        status: row.Active === 1 || row.Active === 'Y' ? 'Active' : undefined,
        street: row.Location?.trim() ?? '',
        purpose: undefined,
        locationNote: undefined,
        mentionsMain: false,
        dataset: 'laPermitsArchived',
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
    `laPermits: ${counts.utility.toLocaleString()} utility dig records of ${counts.read.toLocaleString()}, ${counts.assumed.toLocaleString()} LADWP filed as water without saying, ${counts.onBlock.toLocaleString()} on a block, ${groups.size.toLocaleString()} groups`,
  );
  return groups.size;
};
