import type { Geometry } from 'geojson';
import type { z } from 'zod';
import { permitGroupFeature, scrubContacts, type PermitRecord } from '../../src/sources/permits';
import { gridCellOf } from '../../src/grid';
import { SEA_BOROUGH } from '../../src/sources/seaGeocode';
import type { BuiltMainRow } from '../../src/sources/mains';
import { everyCell, middleCell } from '../placement';
import { asset, ringsToPolygons, type DcBuildTools } from '../dc/build';
import { classifySeaPermit } from './permits';
import { buildSeaServices } from './services';
import { buildSeaSideSewers } from './sideSewers';
import type {
  seaCatchBasinSchema,
  seaElectricLineSchema,
  seaElectricStructureSchema,
  seaHoleSchema,
  seaLightSchema,
  seaPermitSchema,
  seaPolygonSchema,
  seaSewerSchema,
  seaSignalSchema,
  seaStreetSchema,
  seaWaterMainSchema,
} from './datasets';

/**
 * Writes the City of Seattle into the same cells as the other cities: SDOT's street segments,
 * building outlines, Street Use permits grouped by the segment each names and by utility, SPU's
 * sewers at their recorded depth, its water mains, water services and side sewers on their
 * mapped routes, City Light's underground lines and structures, and point assets ready-made. See docs/regions/sea.md.
 */

const PURPOSE_CHARS = 240;

// How SDOT's own use descriptions begin.
const STANDARD_USE = /^(Installing|Installation|Franchise utility)/;

const isoDate = (millis: number | null | undefined) =>
  millis && millis > 0 ? new Date(millis).toISOString().slice(0, 10) : undefined;

const yearOf = (millis: number | null | undefined) => {
  const year = millis ? new Date(millis).getUTCFullYear() : 0;
  return year > 1800 ? year : null;
};

// SPU's sewer types: drainage pipes carry only runoff.
const SEWER_USES: Record<string, string> = {
  Combined: 'combined',
  Sanitary: 'sanitary',
  Drainage: 'storm',
};

// City Light's structure types. A pad holds a transformer at grade, over its vault.
const SCL_STRUCTURES: Record<string, { title: string; detail: string }> = {
  H: {
    title: 'City Light handhole',
    detail: 'Handhole, a small box where cables are pulled and spliced',
  },
  M: { title: 'City Light manhole', detail: 'Manhole, a room-sized chamber for cable splices' },
  V: { title: 'City Light vault', detail: 'Vault, holding transformers or switches' },
  P: { title: 'City Light pad', detail: 'Pad, a transformer or switch at street level' },
};

/** Depth to the bottom of a pipe at one end, or null for a blank or impossible one. */
const endDepth = (value: number | null | undefined) =>
  value !== null && value !== undefined && value > 0 && value < 60 ? value : null;

export const buildSea = async ({ shardDataset, readRows, shards }: DcBuildTools) => {
  const blocks = new Map<number, [number, number][]>();
  await shardDataset(
    'seaStreets',
    (row: z.infer<typeof seaStreetSchema>) => {
      const paths = row.geometry.paths;
      if (!paths.length || !row.ONSTREET?.trim()) return [];
      if (row.COMPKEY) blocks.set(row.COMPKEY, paths.flat() as [number, number][]);
      return everyCell(
        {
          full_street_name: row.ONSTREET.trim(),
          borough: SEA_BOROUGH,
          the_geom: { type: 'MultiLineString', coordinates: paths },
        },
        paths,
      );
    },
    'centerline',
  );

  await shardDataset(
    'seaBuildings',
    (row: z.infer<typeof seaPolygonSchema>) => {
      const polygons = ringsToPolygons(row.geometry.rings as [number, number][][]);
      return polygons.length
        ? middleCell({ the_geom: { type: 'MultiPolygon', coordinates: polygons } }, polygons)
        : [];
    },
    'buildings',
  );

  const point = (row: { geometry: { x: number; y: number } }) => [row.geometry.x, row.geometry.y];

  // Hole covers give the street's height, in feet; only differences are used.
  await shardDataset(
    'seaSewerHoles',
    (row: z.infer<typeof seaHoleSchema>) =>
      row.MNLEP_CVR_ELEV_FT_NBR
        ? middleCell(
            {
              the_geom: { type: 'Point', coordinates: point(row) },
              elevation: row.MNLEP_CVR_ELEV_FT_NBR.toFixed(2),
            },
            point(row),
          )
        : [],
    'elevations',
  );
  await shardDataset(
    'seaSewerHoles',
    (row: z.infer<typeof seaHoleSchema>) =>
      middleCell(
        asset(
          'manhole',
          'sewer',
          'Sewer maintenance hole',
          [
            ['Hole', row.MNLEP_S_ENDPT_ID],
            ['Kind', row.MNLEP_FEATYPE_TEXT],
            [
              'Depth',
              endDepth(row.MNLEP_DEPTH_FT_NBR) ? `${row.MNLEP_DEPTH_FT_NBR!.toFixed(1)} ft` : null,
            ],
          ],
          'seaSewerHoles',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );

  // SPU records each pipe's depth below the hole cover at both ends, to the pipe's bottom; less
  // the pipe's own height, that's the cover over it.
  const counts = { sewers: 0, measured: 0 };
  await shardDataset(
    'seaSewers',
    (row: z.infer<typeof seaSewerSchema>) => {
      const paths = row.geometry.paths;
      if (!paths.length) return [];
      const heightFt = (row.MNL_WIDTH_IN_NBR ?? 8) / 12;
      const ends = [endDepth(row.MNL_UPS_DEPTH_FT_NBR), endDepth(row.MNL_DNS_DEPTH_FT_NBR)].filter(
        (depth): depth is number => depth !== null,
      );
      const cover = ends.length
        ? ends.reduce((sum, depth) => sum + depth, 0) / ends.length - heightFt
        : null;
      const depth = cover !== null && cover > 0 ? Math.round(cover * 10) / 10 : null;
      counts.sewers += 1;
      if (depth !== null) counts.measured += 1;
      const main: BuiltMainRow = {
        id: `sea-${row.OBJECTID}`,
        utility: 'sewer',
        diameter_in: row.MNL_WIDTH_IN_NBR || null,
        material: row.MNL_MATERIAL_TYPE?.trim() || null,
        installed_year: yearOf(row.MNL_INSTALL_DATE),
        depth_ft: depth,
        use: (row.MNL_PRBL_FLOW_TEXT && SEWER_USES[row.MNL_PRBL_FLOW_TEXT]) ?? null,
        source: 'seaSewers',
        the_geom: { type: 'MultiLineString', coordinates: paths },
      };
      return everyCell(main, paths);
    },
    'mains',
  );
  console.log(
    `seaSewers: ${counts.sewers.toLocaleString()} sewers, ${counts.measured.toLocaleString()} with a recorded depth`,
  );

  await shardDataset(
    'seaWaterMains',
    (row: z.infer<typeof seaWaterMainSchema>) => {
      const paths = row.geometry.paths;
      if (!paths.length) return [];
      // Recorded on about one main in eight, mostly as the standard 3 ft.
      const depth = Number(row.DEPTH);
      const main: BuiltMainRow = {
        id: `seaw-${row.OBJECTID}`,
        utility: 'water',
        diameter_in: row.DIAMETER || null,
        material: row.MTRL_DESC?.trim() || null,
        installed_year: row.INSTALL_YR && row.INSTALL_YR > 1800 ? row.INSTALL_YR : null,
        depth_ft: depth > 0 && depth < 30 ? depth : null,
        use: 'distribution',
        source: 'seaWaterMains',
        the_geom: { type: 'MultiLineString', coordinates: paths },
      };
      return everyCell(main, paths);
    },
    'mains',
  );

  await buildSeaServices(readRows, shards);
  await buildSeaSideSewers(readRows, shards);

  // City Light's underground lines, generalized for public use: route only, no size, year or
  // depth.
  await shardDataset(
    'seaElectricLines',
    (row: z.infer<typeof seaElectricLineSchema>) => {
      const paths = row.geometry.paths.filter((path) => path.length > 1);
      if (!paths.length) return [];
      const main: BuiltMainRow = {
        id: `seae-${row.OBJECTID}`,
        utility: 'electric',
        diameter_in: null,
        material: null,
        installed_year: null,
        depth_ft: null,
        use: null,
        source: 'seaElectricLines',
        the_geom: { type: 'MultiLineString', coordinates: paths },
      };
      return everyCell(main, paths);
    },
    'mains',
  );

  await shardDataset(
    'seaCatchBasins',
    (row: z.infer<typeof seaCatchBasinSchema>) =>
      middleCell(
        asset(
          'catch-basin',
          'sewer',
          'Catch basin',
          [
            ['Kind', row.CB_FEATYPE_TEXT?.replace(/[()]/g, '')],
            ['Owner', row.CB_OWNER_NAME],
            [
              'Depth',
              endDepth(row.CB_DEPTH_FT_NBR) ? `${row.CB_DEPTH_FT_NBR!.toFixed(1)} ft` : null,
            ],
            ['Implies', 'A pipe from the basin to the sewer or drainage main in the street'],
          ],
          'seaCatchBasins',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );
  await shardDataset(
    'seaLights',
    (row: z.infer<typeof seaLightSchema>) =>
      middleCell(
        asset(
          'street-lamp',
          'electric',
          'Street light',
          [
            ['Pole', row.ASSET_ID],
            ['Height', row.HEIGHT ? `${row.HEIGHT} ft` : null],
            ['Implies', 'Fed by City Light cable, overhead or along the curb'],
          ],
          'seaLights',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );
  await shardDataset(
    'seaElectricStructures',
    (row: z.infer<typeof seaElectricStructureSchema>) => {
      const kind = row.FACILITY_TYPE ? SCL_STRUCTURES[row.FACILITY_TYPE] : undefined;
      if (!kind) return [];
      return middleCell(
        asset(
          'electric-structure',
          'electric',
          kind.title,
          [
            ['Kind', kind.detail],
            ['Implies', 'City Light cable underground, in conduit between structures'],
          ],
          'seaElectricStructures',
          row.geometry,
        ),
        point(row),
      );
    },
    'assets',
  );
  await shardDataset(
    'seaSignals',
    (row: z.infer<typeof seaSignalSchema>) => {
      const first = row.geometry.points[0];
      if (!first) return [];
      const at = { x: first[0]!, y: first[1]! };
      return middleCell(
        asset(
          'traffic-signal',
          'electric',
          row.UNITDESC?.trim() || 'Traffic signal',
          [['Signal', row.SIGNAL_TYPE]],
          'seaSignals',
          at,
        ),
        [at.x, at.y],
      );
    },
    'assets',
  );

  return groupSeaPermits(readRows('seaPermits'), blocks, shards);
};

/** Groups the permits by segment and utility, as the other cities' are. Returns how many groups. */
const groupSeaPermits = async (
  rows: AsyncIterable<unknown>,
  blocks: Map<number, [number, number][]>,
  shards: DcBuildTools['shards'],
) => {
  const groups = new Map<string, { geometry: Geometry; records: Map<string, PermitRecord> }>();
  const counts = { read: 0, utility: 0, assumed: 0, onBlock: 0 };
  for await (const raw of rows) {
    const row = raw as z.infer<typeof seaPermitSchema>;
    counts.read += 1;
    const work = classifySeaPermit(row.APPLICANT_COMPANY, row.USE_TYPE, row.USE_DESCRIPTION);
    if (!work || !row.PERMIT_NUMBER) continue;
    const block = row.STREET_KEY ? blocks.get(row.STREET_KEY) : undefined;
    const path = row.geometry?.paths.flat();
    const middle = path?.length ? path[Math.floor(path.length / 2)] : undefined;
    if (!block && !middle) continue;
    counts.utility += 1;
    if (work.assumed) counts.assumed += 1;
    if (block) counts.onBlock += 1;
    const place = block
      ? String(row.STREET_KEY)
      : `${middle![0]!.toFixed(5)},${middle![1]!.toFixed(5)}`;
    const geometry: Geometry = block
      ? { type: 'LineString', coordinates: block }
      : { type: 'Point', coordinates: middle! };
    const key = `${work.utility}|sea|${place}`;
    const group = groups.get(key) ?? { geometry, records: new Map() };
    // SDOT's standard wording for the work. Anything else on that line was typed by a crew, and
    // can name people, so the use type stands in for it.
    const firstLine = row.USE_DESCRIPTION?.split('\n')[0]?.replace(/\s+/g, ' ').trim();
    const purpose =
      firstLine && STANDARD_USE.test(firstLine) ? firstLine : row.USE_TYPE?.trim() || undefined;
    const street = [row.ON_STREET, [row.FROM_STREET, row.TO_STREET].filter(Boolean).join(' and ')]
      .filter(Boolean)
      .join(' between ');
    group.records.set(row.PERMIT_NUMBER, {
      permitNumber: row.PERMIT_NUMBER,
      utility: work.utility,
      type: work.assumed
        ? 'Street Use utility permit, water or sewer not stated'
        : 'Street Use utility permit',
      permittee: work.owner,
      issued: isoDate(row.FIRST_ISSUED_DATE),
      workStart: isoDate(row.USE_START_DATE),
      workEnd: isoDate(row.USE_END_DATE),
      status: row.PERMIT_STATUS?.trim() || undefined,
      street,
      purpose: purpose ? scrubContacts(purpose).slice(0, PURPOSE_CHARS) : undefined,
      locationNote: undefined,
      mentionsMain: /\bmains?\b/i.test(purpose ?? ''),
      dataset: 'seaPermits',
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
    `seaPermits: ${counts.utility.toLocaleString()} utility dig records of ${counts.read.toLocaleString()}, ${counts.assumed.toLocaleString()} SPU filed as water without saying, ${counts.onBlock.toLocaleString()} on a segment, ${groups.size.toLocaleString()} groups`,
  );
  return groups.size;
};
