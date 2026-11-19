import type { Geometry } from 'geojson';
import type { z } from 'zod';
import { permitGroupFeature, scrubContacts, type PermitRecord } from '../../src/sources/permits';
import { gridCellOf } from '../../src/grid';
import { SD_BOROUGH } from '../../src/sources/sdGeocode';
import type { BuiltMainRow } from '../../src/sources/mains';
import { everyCell, middleCell } from '../placement';
import { asset, ringsToPolygons, type DcBuildTools } from '../dc/build';
import { createBlockIndex, permitStreet, type DcBlock } from '../dc/blocks';
import { classifySdPermit } from './permits';
import { endKey, stormDrainCover, stormDrainMaterial, stormDrainSizeIn } from './drains';
import { buildSdServices } from './services';
import type {
  sdHydrantSchema,
  sdInletSchema,
  sdLightSchema,
  sdManholeSchema,
  sdPermitSchema,
  sdPolygonSchema,
  sdRecycledMainSchema,
  sdSewerSchema,
  sdSignalSchema,
  sdStormDrainSchema,
  sdStreetSchema,
  sdWaterMainSchema,
} from './datasets';

/**
 * Writes the City of San Diego into the same cells as the other cities: SanGIS road segments and
 * building outlines, right of way permits grouped by block and utility, the city's sewers and
 * storm drains at their measured depth, its water and recycled water mains on their mapped
 * routes, its service line inventory by address, and point assets ready-made.
 * See docs/regions/sd.md.
 */

// Flat meters around the middle of the city, for finding a permit's block.
const SD_MIDDLE: [number, number] = [-117.14, 32.8];

const PURPOSE_CHARS = 240;

// SanGIS files "05TH AVE"; people and the permits write "5th Av".
const withoutLeadingZeros = (name: string) => name.replace(/\b0+(\d)/g, '$1');

// Permits filed with no place of their own sit on the permit office, 1222 First Avenue. Some
// say so in the address; others keep their real address (Bellevue Av, El Cajon Bl) but carry
// the office's point, about 60 of them in the 2026-11 file.
const PLACEHOLDER = /^1222\s+0?1st\s+av/i;
const PERMIT_OFFICE: [number, number] = [-117.16334, 32.71832];

/** Whether a point is the permit office's, within the 60 m or so its copies wander. */
export const atPermitOffice = ([lng, lat]: [number, number]) =>
  Math.hypot(
    (lng - PERMIT_OFFICE[0]) * 111_320 * Math.cos((lat * Math.PI) / 180),
    (lat - PERMIT_OFFICE[1]) * 110_540,
  ) < 75;

const isoDate = (millis: number | null | undefined) =>
  millis && millis > 0 ? new Date(millis).toISOString().slice(0, 10) : undefined;

/**
 * A permit's dates, or null for one never issued. The permits have no work dates, so work is
 * taken to start on the issue date and run to the close, or the expiry if it isn't closed. An
 * approval with no issue date (created, opened, in review or cancelled) may never be dug, so it
 * is left out, as DC's applications are.
 */
export const sdPermitDates = (row: {
  APPROVAL_ISSUE_DATE?: number | null;
  APPROVAL_CLOSE_DATE?: number | null;
  APPROVAL_EXPIRE_DATE?: number | null;
}): Pick<PermitRecord, 'issued' | 'workStart' | 'workEnd'> | null => {
  const issued = isoDate(row.APPROVAL_ISSUE_DATE);
  if (!issued) return null;
  return {
    issued,
    workStart: issued,
    workEnd: isoDate(row.APPROVAL_CLOSE_DATE ?? row.APPROVAL_EXPIRE_DATE),
  };
};

const yearOf = (millis: number | null | undefined) => {
  const year = millis ? new Date(millis).getUTCFullYear() : 0;
  return year > 1800 ? year : null;
};

// Zero is how these layers leave an elevation blank; near the bay a real one can be below zero.
const isElevation = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined && value !== 0;

const decodeEntities = (text: string) => text.replace(/&amp;/g, '&');

/** "6832 1/3 Newbold Ct, San Diego, CA" or "9555 1/3 DISTRIBUTION AV" to "Newbold Ct". */
export const sdPermitStreet = (address: string | null | undefined) =>
  permitStreet(
    address
      ?.split(',')[0]
      ?.replace(/^(\d+)\s+\d\/\d\s+/, '$1 ')
      .replace(/\b0+(\d)/g, '$1')
      .trim(),
  );

export const buildSd = async ({ shardDataset, readRows, shards }: DcBuildTools) => {
  const blocks: DcBlock[] = [];
  // The cells the city's own streets reach. SanGIS buildings cover the county, and the city's
  // box takes in Chula Vista, National City and others; their buildings alone don't make a cell.
  const cityCells = new Set<string>();
  await shardDataset(
    'sdStreets',
    (row: z.infer<typeof sdStreetSchema>) => {
      const paths = row.geometry.paths;
      if (!paths.length || !row.rd30full?.trim()) return [];
      const name = withoutLeadingZeros(row.rd30full.trim());
      blocks.push({
        key: String(row.roadsegid ?? `${paths[0]![0]}`),
        street: name,
        path: paths.flat() as [number, number][],
      });
      const placements = everyCell(
        {
          full_street_name: name,
          borough: SD_BOROUGH,
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
    'sdBuildings',
    (row: z.infer<typeof sdPolygonSchema>) => {
      const polygons = ringsToPolygons(row.geometry.rings as [number, number][][]);
      if (!polygons.length) return [];
      return middleCell(
        { the_geom: { type: 'MultiPolygon', coordinates: polygons } },
        polygons,
      ).filter(([cell]) => cityCells.has(cell.key));
    },
    'buildings',
  );

  const point = (row: { geometry: { x: number; y: number } }) => [row.geometry.x, row.geometry.y];

  // Manhole rims give the street's height, in feet; only differences are used, so the datum
  // the city never states doesn't matter.
  const rims = new Map<string, number>();
  await shardDataset(
    'sdSewerManholes',
    (row: z.infer<typeof sdManholeSchema>) => {
      if (!isElevation(row.rim_elev_qty)) return [];
      if (row.fac_seq_num) rims.set(String(row.fac_seq_num), row.rim_elev_qty);
      return middleCell(
        {
          the_geom: { type: 'Point', coordinates: point(row) },
          elevation: row.rim_elev_qty.toFixed(2),
        },
        point(row),
      );
    },
    'elevations',
  );
  await shardDataset(
    'sdSewerManholes',
    (row: z.infer<typeof sdManholeSchema>) =>
      middleCell(
        asset(
          'manhole',
          'sewer',
          'Sewer manhole',
          [
            ['Manhole', row.fac_seq_num ? String(row.fac_seq_num) : null],
            ['Kind', row.manhl_typ_desc],
            ['Depth', row.depth_qty && row.depth_qty > 0 ? `${row.depth_qty.toFixed(1)} ft` : null],
          ],
          'sdSewerManholes',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );

  // Each pipe at its measured depth: the rim at either end, less the invert there, less the
  // pipe's own height.
  const counts = { sewers: 0, measured: 0 };
  await shardDataset(
    'sdSewers',
    (row: z.infer<typeof sdSewerSchema>) => {
      const paths = row.geometry.paths;
      if (!paths.length) return [];
      const heightFt = (row.size_num ?? 8) / 12;
      const ends = [
        [row.upstrm_fac_seq_num, row.upstrm_invert_elev_qty],
        [row.dnstrm_fac_seq_num, row.dnstreamie],
      ].flatMap(([manhole, invert]) => {
        const rim = manhole == null ? undefined : rims.get(String(manhole));
        return rim !== undefined && isElevation(invert as number) && rim > (invert as number)
          ? [rim - (invert as number)]
          : [];
      });
      const cover = ends.length
        ? ends.reduce((sum, depth) => sum + depth, 0) / ends.length - heightFt
        : null;
      // Past 60 ft it's a mistyped elevation, not a sewer.
      const depth = cover !== null && cover > 0 && cover < 60 ? Math.round(cover * 10) / 10 : null;
      counts.sewers += 1;
      if (depth !== null) counts.measured += 1;
      const main: BuiltMainRow = {
        id: `sd-${row.objectid}`,
        utility: 'sewer',
        diameter_in: row.size_num ?? null,
        material: row.matl_desc ? sentenceCase(row.matl_desc) : null,
        installed_year: yearOf(row.inst_dt),
        depth_ft: depth,
        use: row.main_typ_desc === 'TRUNK SEWER' ? 'trunk' : 'sanitary',
        source: 'sdSewers',
        the_geom: { type: 'MultiLineString', coordinates: paths },
      };
      return everyCell(main, paths);
    },
    'mains',
  );
  rims.clear();
  console.log(
    `sdSewers: ${counts.sewers.toLocaleString()} sewers, ${counts.measured.toLocaleString()} with a measured depth`,
  );

  await shardDataset(
    'sdWaterMains',
    (row: z.infer<typeof sdWaterMainSchema>) => {
      const paths = row.geometry.paths;
      if (!paths.length) return [];
      const main: BuiltMainRow = {
        id: `sdw-${row.objectid}`,
        utility: 'water',
        diameter_in: row.insd_diam_size_num || null,
        material: row.materiald ? sentenceCase(row.materiald) : null,
        installed_year: yearOf(row.inst_dt),
        depth_ft: null,
        use: row.pipetyped?.toLowerCase() ?? null,
        source: 'sdWaterMains',
        the_geom: { type: 'MultiLineString', coordinates: paths },
      };
      return everyCell(main, paths);
    },
    'mains',
  );

  await shardDataset(
    'sdRecycledMains',
    (row: z.infer<typeof sdRecycledMainSchema>) => {
      const paths = row.geometry.paths;
      if (!paths.length) return [];
      const owner = row.ownrshipd?.trim();
      const main: BuiltMainRow = {
        id: `sdr-${row.objectid}`,
        utility: 'water',
        diameter_in: row.insd_diam_size_num || null,
        material: row.materiald && row.materiald !== 'UNKNOWN' ? sentenceCase(row.materiald) : null,
        installed_year: yearOf(row.inst_dt),
        depth_ft: null,
        use: 'recycled',
        // A few belong to neighboring water districts or private owners, named on the card.
        owner: owner && owner !== 'CITY OF SAN DIEGO' ? (RECYCLED_OWNERS[owner] ?? owner) : null,
        source: 'sdRecycledMains',
        the_geom: { type: 'MultiLineString', coordinates: paths },
      };
      return everyCell(main, paths);
    },
    'mains',
  );

  await buildSdServices(readRows, shards);

  await shardDataset(
    'sdHydrants',
    (row: z.infer<typeof sdHydrantSchema>) =>
      middleCell(
        asset(
          'hydrant',
          'water',
          'Fire hydrant',
          [
            ['Hydrant', row.fac_seq_num ? String(row.fac_seq_num) : null],
            ['Size', row.size_num ? `${row.size_num} in` : null],
            ['Make', row.make_desc ? sentenceCase(row.make_desc) : null],
            ['Implies', 'A water main nearby, with a branch line to the hydrant'],
          ],
          'sdHydrants',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );
  // Inlet and cleanout rims, by the point the storm drains are drawn to.
  const drainRims = new Map<string, number>();
  await shardDataset(
    'sdInlets',
    (row: z.infer<typeof sdInletSchema>) => {
      if (isElevation(row.elevation)) drainRims.set(endKey(point(row)), row.elevation);
      if (row.structure_type !== 'I') return [];
      return middleCell(
        asset(
          'catch-basin',
          'sewer',
          'Storm drain inlet',
          [
            ['Inlet', row.iamfloc],
            ['Where', row.loc_desc],
            [
              'Implies',
              'A pipe from the inlet to the storm drain; San Diego keeps runoff out of its sewers',
            ],
          ],
          'sdInlets',
          row.geometry,
        ),
        point(row),
      );
    },
    'assets',
  );

  const drains = { pipes: 0, measured: 0 };
  await shardDataset(
    'sdStormDrains',
    (row: z.infer<typeof sdStormDrainSchema>) => {
      const paths = row.geometry.paths;
      const first = paths[0]?.[0];
      const last = paths.at(-1)?.at(-1);
      if (!first || !last) return [];
      const sizeIn = stormDrainSizeIn(row.diameter, row.height);
      const depth = stormDrainCover(
        [
          [drainRims.get(endKey(first)), row.from_elev],
          [drainRims.get(endKey(last)), row.to_elev],
        ],
        sizeIn,
      );
      drains.pipes += 1;
      if (depth !== null) drains.measured += 1;
      const main: BuiltMainRow = {
        id: `sdd-${row.objectid}`,
        utility: 'sewer',
        diameter_in: sizeIn,
        material: stormDrainMaterial(row.material, row.drain_conveyance_type),
        installed_year: yearOf(row.install_ye),
        depth_ft: depth,
        use: 'storm',
        source: 'sdStormDrains',
        the_geom: { type: 'MultiLineString', coordinates: paths },
      };
      return everyCell(main, paths);
    },
    'mains',
  );
  drainRims.clear();
  console.log(
    `sdStormDrains: ${drains.pipes.toLocaleString()} pipes, ${drains.measured.toLocaleString()} with a measured depth`,
  );
  await shardDataset(
    'sdLights',
    (row: z.infer<typeof sdLightSchema>) =>
      middleCell(
        asset(
          'street-lamp',
          'electric',
          'Street light',
          [
            ['Pole', row.POLE_TYPE],
            ['Height', row.POLE_HEIGHT_FT ? `${row.POLE_HEIGHT_FT} ft` : null],
            ['Where', row.LOC_DESC],
            ['Implies', 'Fed by underground cable along the curb'],
          ],
          'sdLights',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );
  await shardDataset(
    'sdSignals',
    (row: z.infer<typeof sdSignalSchema>) =>
      middleCell(
        asset(
          'traffic-signal',
          'electric',
          row.LOC_DESC?.trim() || 'Traffic signal',
          [['Signal', row.SIGNAL_ID]],
          'sdSignals',
          row.geometry,
        ),
        point(row),
      ),
    'assets',
  );

  return groupSdPermits([readRows('sdPermits'), readRows('sdPermitsOld')], blocks, shards);
};

// Owners of the recycled water mains other than the city, in their own names.
const RECYCLED_OWNERS: Record<string, string> = {
  'OTAY MUNICIPAL WATER DIST': 'Otay Water District',
  'CITY OF POWAY': 'City of Poway',
  'PADRE DAM MUNC WATER DIST': 'Padre Dam Municipal Water District',
  'OLIVENHAIN WATER DISTRICT': 'Olivenhain Municipal Water District',
  'OTHER (PRIVATE)': 'Private',
  PRIVATE: 'Private',
};

const sentenceCase = (text: string) => {
  const lower = text.trim().toLowerCase();
  return lower ? `${lower[0]!.toUpperCase()}${lower.slice(1)}` : lower;
};

/** Groups the permits by block and utility, as the other cities' are. Returns how many groups. */
const groupSdPermits = async (
  sources: AsyncIterable<unknown>[],
  blocks: DcBlock[],
  shards: DcBuildTools['shards'],
) => {
  const nearestBlock = createBlockIndex(blocks, SD_MIDDLE);
  const blockByKey = new Map(blocks.map((block) => [block.key, block]));
  const groups = new Map<string, { geometry: Geometry; records: Map<string, PermitRecord> }>();
  const counts = { read: 0, utility: 0, assumed: 0, placeholder: 0, unissued: 0, onBlock: 0 };
  for (const rows of sources)
    for await (const raw of rows) {
      const row = raw as z.infer<typeof sdPermitSchema>;
      counts.read += 1;
      const scope = row.PROJECT_SCOPE ? decodeEntities(row.PROJECT_SCOPE) : null;
      const works = classifySdPermit(
        row.APPROVAL_PERMIT_HOLDER ? decodeEntities(row.APPROVAL_PERMIT_HOLDER) : null,
        row.PROJECT_TITLE ? decodeEntities(row.PROJECT_TITLE) : null,
        scope,
        row.APPROVAL_TYPE,
      );
      if (!works.length || row.GIS_LONGITUDE === null || row.GIS_LATITUDE === null) continue;
      if (PLACEHOLDER.test(row.GIS_ADDRESS?.trim() ?? '')) {
        counts.placeholder += 1;
        continue;
      }
      const dates = sdPermitDates(row);
      if (!dates) {
        counts.unissued += 1;
        continue;
      }
      counts.utility += 1;
      const at: [number, number] = [row.GIS_LONGITUDE, row.GIS_LATITUDE];
      const block = nearestBlock(at, sdPermitStreet(row.GIS_ADDRESS));
      // At the office with its own street nowhere near: the point is the placeholder.
      if (!block && atPermitOffice(at)) {
        counts.utility -= 1;
        counts.placeholder += 1;
        continue;
      }
      const place = block ? block.key : `${at[0].toFixed(5)},${at[1].toFixed(5)}`;
      const geometry: Geometry = block
        ? { type: 'LineString', coordinates: blockByKey.get(block.key)!.path }
        : { type: 'Point', coordinates: at };
      if (block) counts.onBlock += 1;
      const permitNumber = row.APPROVAL_ID;
      for (const work of works) {
        if (work.assumed) counts.assumed += 1;
        const key = `${work.utility}|sd|${place}`;
        const group = groups.get(key) ?? { geometry, records: new Map() };
        group.records.set(permitNumber, {
          permitNumber,
          utility: work.utility,
          type: work.assumed
            ? 'Right of way permit, gas or electric not stated'
            : 'Right of way permit',
          permittee: work.owner,
          ...dates,
          status: row.APPROVAL_STATUS?.trim() || undefined,
          street: withoutLeadingZeros(row.GIS_ADDRESS?.split(',')[0]?.trim() ?? ''),
          // The scope can open with the planning area and zoning; it's kept as written, less
          // any phone number or email.
          purpose: scope
            ? scrubContacts(scope.replace(/\s+/g, ' ').trim()).slice(0, PURPOSE_CHARS)
            : undefined,
          locationNote: undefined,
          mentionsMain: /\bmain\b/i.test(scope ?? ''),
          dataset: 'sdPermits',
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
    `sdPermits: ${counts.utility.toLocaleString()} utility dig records of ${counts.read.toLocaleString()}, ${counts.assumed.toLocaleString()} SDG&E filed as electric without saying, ${counts.placeholder.toLocaleString()} on the permit office's placeholder address, ${counts.unissued.toLocaleString()} never issued, ${counts.onBlock.toLocaleString()} on a block, ${groups.size.toLocaleString()} groups`,
  );
  return groups.size;
};
