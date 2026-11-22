import type { Geometry, Position } from 'geojson';
import type { z } from 'zod';
import { permitGroupFeature, type PermitRecord } from '../../src/sources/permits';
import { gridCellOf } from '../../src/grid';
import { SJ_BOROUGH } from '../../src/sources/sjGeocode';
import type { BuiltMainRow } from '../../src/sources/mains';
import type { SourceKey } from '../../src/sources/catalog';
import { everyCell, middleCell } from '../placement';
import { asset, ringsToPolygons, type DcBuildTools } from '../dc/build';
import { createBlockIndex, type DcBlock } from '../dc/blocks';
import { classifySjPermit, isSjSkip, type SjSkip } from './permits';
import { addRim, sjGround, sjMaterial, sjPipeCover, sjPipeSize, type Rims } from './sewers';
import {
  SJ_BOUNDS,
  type SjPermitRow,
  type sjInletSchema,
  type sjLightSchema,
  type sjMainSchema,
  type sjManholeSchema,
  type sjPermitParcelSchema,
  type sjPermitPointSchema,
  type sjPolygonSchema,
  type sjSignalSchema,
  type sjStreetSchema,
} from './datasets';

/**
 * Writes San Jose into the same cells as the other cities: the city's street centerlines, the
 * county's building footprints, the utility permits that cut the street, grouped by block and
 * utility, the city's sanitary sewers and storm drains at the depths their manholes give, and
 * point assets ready-made. San Jose Water's service line inventory is paused for its terms and
 * isn't built. See docs/regions/sj.md.
 */

// Flat meters around the middle of the city, for finding a permit's block.
const SJ_MIDDLE: [number, number] = [-121.87, 37.31];

// Permits start in March 2019; a year far off either way is a typing slip.
const FIRST_YEAR = 2018;
const LAST_YEAR = new Date().getUTCFullYear() + 3;

const isoDate = (millis: number | null | undefined) => {
  if (!millis) return undefined;
  const date = new Date(millis);
  const year = date.getUTCFullYear();
  return year >= FIRST_YEAR && year <= LAST_YEAR ? date.toISOString().slice(0, 10) : undefined;
};

// "W SANTA CLARA ST" and the like, as people write them: "W Santa Clara St", "N 1st St".
const tidy = (name: string) =>
  name
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_, space: string, letter: string) => space + letter.toUpperCase());

const point = (row: { geometry: { x: number; y: number } }) => [row.geometry.x, row.geometry.y];

/**
 * Why a permit isn't counted as work in the street, or null when it is: never issued (cancelled,
 * still in intake or review), or replaced by another permit ("Upgraded", as when a minor permit
 * is reissued as a major one), which is counted under its own number.
 */
export const sjPermitStatusSkip = (
  status: string | null | undefined,
  issued: number | null | undefined,
): 'never issued' | 'replaced' | null => {
  const value = status?.trim() ?? '';
  if (value === 'Upgraded') return 'replaced';
  if (!issued || ['Cancelled', 'Intake', 'Under Review', 'Pending Approval'].includes(value))
    return 'never issued';
  return null;
};

/** "From N 5th St To N 6th St", as the permit layer writes a segment's ends, to its two streets. */
export const sjPermitEnds = (location: string | null | undefined): [string, string] | null => {
  const match = /^\s*from\s+(.+?)\s+to\s+(.+?)\s*$/i.exec(location ?? '');
  if (!match) return null;
  const [from, to] = [match[1]!.trim(), match[2]!.trim()];
  return from && to ? [from, to] : null;
};

// The city's pick list, in words that read as a kind of permit.
const KINDS: Record<string, string> = {
  Standard: 'Utility excavation permit',
  Emergency: 'Utility excavation permit, emergency',
  Special: 'Special utility permit (major project)',
  Fiber: 'Fiber permit',
};

const middleOf = (path: Position[]): [number, number] | null => {
  const middle = path[Math.floor(path.length / 2)];
  return middle ? [middle[0]!, middle[1]!] : null;
};

/** Where a permit row is: the middle of its street segment, its intersection, or its parcel. */
const placeOf = (
  row: SjPermitRow | z.infer<typeof sjPermitPointSchema> | z.infer<typeof sjPermitParcelSchema>,
) => {
  const geometry = row.geometry as {
    paths?: Position[][];
    x?: number;
    y?: number;
    rings?: Position[][];
  };
  if (geometry.paths) return middleOf(geometry.paths.flat());
  if (geometry.x !== undefined && geometry.y !== undefined)
    return [geometry.x, geometry.y] as [number, number];
  const ring = geometry.rings?.[0];
  if (!ring?.length) return null;
  const sum = ring.reduce((total, [x, y]) => [total[0]! + x!, total[1]! + y!], [0, 0]);
  return [sum[0]! / ring.length, sum[1]! / ring.length] as [number, number];
};

const inSanJose = ([lng, lat]: [number, number]) => {
  const [west, south, east, north] = SJ_BOUNDS;
  return lng >= west && lng <= east && lat >= south && lat <= north;
};

export const buildSj = async ({ shardDataset, readRows, shards }: DcBuildTools) => {
  const blocks: DcBlock[] = [];
  // The cells the city's own streets reach. The county's footprints cover the whole box, which
  // takes in Campbell and the county's islands; only those in these cells are kept.
  const cityCells = new Set<string>();
  await shardDataset(
    'sjStreets',
    (row: z.infer<typeof sjStreetSchema>) => {
      const paths = row.geometry.paths.filter((path) => path.length > 1);
      const name = row.FULLNAME?.trim().toUpperCase();
      if (!paths.length || !name) return [];
      blocks.push({
        key: String(row.OBJECTID),
        street: name,
        path: paths.flat() as [number, number][],
      });
      const placements = everyCell(
        {
          full_street_name: name,
          borough: SJ_BOROUGH,
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
    'sjBuildings',
    (row: z.infer<typeof sjPolygonSchema>) => {
      const polygons = ringsToPolygons(row.geometry.rings as [number, number][][]);
      if (!polygons.length) return [];
      return middleCell(
        { the_geom: { type: 'MultiPolygon', coordinates: polygons } },
        polygons,
      ).filter(([cell]) => cityCells.has(cell.key));
    },
    'buildings',
  );

  // Each structure's ground gives the street's height, in feet, and each pipe the depth at its
  // ends. Sanitary manholes, storm manholes and inlets are each numbered on their own, so each
  // keeps its own map, and a pipe end is read in the layer of the kind it names.
  const sewerRims: Rims = new Map();
  const stormRims: Rims = new Map();
  const inletRims: Rims = new Map();
  for (const [name, rims] of [
    ['sjSewerManholes', sewerRims],
    ['sjStormManholes', stormRims],
  ] as const)
    await shardDataset(
      name,
      (row: z.infer<typeof sjManholeSchema>) => {
        const ground = sjGround(row.RIMELEV, row.DEMELEV);
        addRim(rims, row.FACILITYID, ground);
        return ground === null
          ? []
          : middleCell(
              {
                the_geom: { type: 'Point', coordinates: point(row) },
                elevation: ground.toFixed(2),
              },
              point(row),
            );
      },
      'elevations',
    );

  const manholeAsset =
    (storm: boolean, source: SourceKey) => (row: z.infer<typeof sjManholeSchema>) => {
      const ground = sjGround(row.RIMELEV, row.DEMELEV);
      const invert = row.INVERTELEV;
      const depth = ground !== null && invert && ground > invert ? ground - invert : null;
      return middleCell(
        asset(
          'manhole',
          'sewer',
          storm ? 'Storm manhole' : 'Sanitary manhole',
          [
            ['Manhole', row.FACILITYID],
            ['Depth to invert', depth && depth < 60 ? `${depth.toFixed(1)} ft` : null],
            [
              'Installed',
              row.INSTALLYEAR && row.INSTALLYEAR > 1800 ? String(row.INSTALLYEAR) : null,
            ],
            ['Implies', storm ? 'A storm drain below' : 'A sanitary sewer below'],
          ],
          source,
          row.geometry,
        ),
        point(row),
      );
    };
  await shardDataset('sjSewerManholes', manholeAsset(false, 'sjSewerManholes'), 'assets');
  await shardDataset('sjStormManholes', manholeAsset(true, 'sjStormManholes'), 'assets');

  // Inlets record their rim now and then; a storm drain that starts at one uses it.
  await shardDataset(
    'sjInlets',
    (row: z.infer<typeof sjInletSchema>) => {
      addRim(inletRims, row.FACILITYID, sjGround(row.RIMELEV, null));
      return middleCell(
        asset(
          'catch-basin',
          'sewer',
          'Storm inlet',
          [
            ['Inlet', row.FACILITYID],
            [
              'Implies',
              'A pipe from the inlet to the storm drain; San Jose keeps runoff out of its sanitary sewers',
            ],
          ],
          'sjInlets',
          row.geometry,
        ),
        point(row),
      );
    },
    'assets',
  );

  const counts = { sewers: 0, sewersMeasured: 0, drains: 0, drainsMeasured: 0 };
  const mainRow = (storm: boolean) => (row: z.infer<typeof sjMainSchema>) => {
    const paths = row.geometry.paths.filter((path) => path.length > 1);
    if (!paths.length) return [];
    const size = sjPipeSize(row.DIAMETER);
    const depth = sjPipeCover(
      storm ? { manholes: stormRims, inlets: inletRims } : { manholes: sewerRims },
      [
        [row.UPTYPE, row.UPID, row.UPELEV],
        [row.DOWNTYPE, row.DOWNID, row.DOWNELEV],
      ],
      size ?? (storm ? 18 : 8),
    );
    if (storm) {
      counts.drains += 1;
      if (depth !== null) counts.drainsMeasured += 1;
    } else {
      counts.sewers += 1;
      if (depth !== null) counts.sewersMeasured += 1;
    }
    const year = row.INSTALLYEAR && row.INSTALLYEAR > 1800 ? row.INSTALLYEAR : null;
    const main: BuiltMainRow = {
      id: `${storm ? 'sjd' : 'sj'}-${row.OBJECTID}`,
      utility: 'sewer',
      diameter_in: size,
      material: sjMaterial(row.MATERIAL),
      installed_year: year && year <= new Date().getUTCFullYear() ? year : null,
      depth_ft: depth,
      use: storm ? 'storm' : 'sanitary',
      source: storm ? 'sjStormDrains' : 'sjSewers',
      the_geom: { type: 'MultiLineString', coordinates: paths },
    };
    return everyCell(main, paths);
  };
  await shardDataset('sjSewers', mainRow(false), 'mains');
  await shardDataset('sjStormDrains', mainRow(true), 'mains');
  sewerRims.clear();
  stormRims.clear();
  inletRims.clear();
  console.log(
    `sjSewers: ${counts.sewers.toLocaleString()} sanitary sewers, ${counts.sewersMeasured.toLocaleString()} with a measured depth; sjStormDrains: ${counts.drains.toLocaleString()} storm drains, ${counts.drainsMeasured.toLocaleString()} with a measured depth`,
  );

  await shardDataset(
    'sjLights',
    (row: z.infer<typeof sjLightSchema>) => {
      const owner = row.POLEOWNER?.trim();
      return middleCell(
        asset(
          'street-lamp',
          'electric',
          'Street light',
          [
            ['Pole', row.POLEMATERIAL ? tidy(row.POLEMATERIAL) : null],
            [
              'Height',
              row.POLEHEIGHT && /^\d+(\.\d+)?$/.test(row.POLEHEIGHT.trim())
                ? `${row.POLEHEIGHT.trim()} ft`
                : null,
            ],
            ['Owner', owner === 'PGE' ? 'PG&E' : owner === 'CALTRAN' ? 'Caltrans' : null],
            ['Implies', 'Fed by underground cable along the curb'],
          ],
          'sjLights',
          row.geometry,
        ),
        point(row),
      );
    },
    'assets',
  );
  await shardDataset(
    'sjSignals',
    (row: z.infer<typeof sjSignalSchema>) => {
      const where = [row.INTERSECTIONNAME1, row.INTERSECTIONNAME2]
        .map((name) => name?.trim())
        .filter(Boolean)
        .join(' and ');
      return middleCell(
        asset(
          'traffic-signal',
          'electric',
          where || 'Traffic signal',
          [['Kind', row.SHOPTYPE]],
          'sjSignals',
          row.geometry,
        ),
        point(row),
      );
    },
    'assets',
  );

  return groupSjPermits(
    [readRows('sjPermits'), readRows('sjPermitPoints'), readRows('sjPermitParcels')],
    blocks,
    shards,
  );
};

/** Groups the permits by block and utility, as the other cities' are. Returns how many groups. */
const groupSjPermits = async (
  sources: AsyncIterable<unknown>[],
  blocks: DcBlock[],
  shards: DcBuildTools['shards'],
) => {
  const nearestBlock = createBlockIndex(blocks, SJ_MIDDLE);
  const blockByKey = new Map(blocks.map((block) => [block.key, block]));
  const groups = new Map<string, { geometry: Geometry; records: Map<string, PermitRecord> }>();
  const counts = {
    read: 0,
    skipped: {} as Partial<Record<SjSkip | 'never issued' | 'replaced', number>>,
    noPlace: 0,
    kept: 0,
    onBlock: 0,
    noOpening: 0,
    assumed: 0,
    byUtility: {} as Record<string, number>,
    byOwner: {} as Record<string, number>,
    byClass: { letter: 0, text: 0 },
  };
  const skip = (why: SjSkip | 'never issued' | 'replaced') => {
    counts.skipped[why] = (counts.skipped[why] ?? 0) + 1;
  };
  for (const rows of sources)
    for await (const raw of rows) {
      const row = raw as SjPermitRow;
      counts.read += 1;
      const status = sjPermitStatusSkip(row.STATUSDESC, row.ISSUEDATE);
      if (status) {
        skip(status);
        continue;
      }
      const works = classifySjPermit(row.REFERENCEFILE, row.WORKDESC, row.FOLDERDESCRIPTION);
      if (isSjSkip(works)) {
        skip(works);
        continue;
      }
      const at = placeOf(row);
      if (!at || !inSanJose(at)) {
        counts.noPlace += 1;
        continue;
      }
      counts.kept += 1;
      if (/^[A-Z]+\d/.test(row.REFERENCEFILE?.trim() ?? '')) counts.byClass.letter += 1;
      else counts.byClass.text += 1;
      // The segment's middle sits on the centerline; the folder is often named for its street.
      const block = nearestBlock(at, row.FOLDERNAME?.trim() || null);
      if (block) counts.onBlock += 1;
      const place = block ? block.key : `${at[0].toFixed(5)},${at[1].toFixed(5)}`;
      const geometry: Geometry = block
        ? { type: 'LineString', coordinates: blockByKey.get(block.key)!.path }
        : { type: 'Point', coordinates: at };
      const permitNumber = row.REFERENCEFILE?.trim() || `Folder ${row.FOLDERRSN ?? row.OBJECTID}`;
      const ends = sjPermitEnds(row.PROPERTYLOCATION);
      const streetName = block ? tidy(block.street) : '';
      const street = streetName
        ? ends
          ? `${streetName} between ${ends[0]} and ${ends[1]}`
          : streetName
        : '';
      const kind = KINDS[row.WORKDESC?.trim() ?? ''] ?? 'Utility permit';
      const description = row.FOLDERDESCRIPTION ?? '';
      for (const work of works) {
        counts.byUtility[work.utility] = (counts.byUtility[work.utility] ?? 0) + 1;
        counts.byOwner[work.owner] = (counts.byOwner[work.owner] ?? 0) + 1;
        if (work.noOpening) counts.noOpening += 1;
        if (work.assumed) counts.assumed += 1;
        const key = `${work.utility}|sj|${place}`;
        const group = groups.get(key) ?? { geometry, records: new Map() };
        group.records.set(permitNumber, {
          permitNumber,
          utility: work.utility,
          type: work.noOpening
            ? 'No excavation (access or traffic control)'
            : work.assumed
              ? `${kind}, gas or electric not stated`
              : kind,
          permittee: work.owner,
          issued: isoDate(row.ISSUEDATE),
          workStart: isoDate(row.ISSUEDATE),
          workEnd: isoDate(row.FINALDATE ?? row.EXPIRYDATE),
          status: row.STATUSDESC?.trim() || undefined,
          street,
          // The description is crew-typed free text and can name people; it never leaves the build.
          purpose: undefined,
          locationNote: undefined,
          mentionsMain: /\bmains?\b/i.test(description),
          dataset: 'sjPermits',
          ...(work.noOpening && { noOpening: true as const }),
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
    `sjPermits: ${counts.kept.toLocaleString()} utility permits placed of ${counts.read.toLocaleString()} rows (left out ${JSON.stringify(counts.skipped)}, ${counts.noPlace.toLocaleString()} with no place in the city), ${counts.byClass.letter.toLocaleString()} read by their permit letter and ${counts.byClass.text.toLocaleString()} from the description alone, by utility ${JSON.stringify(counts.byUtility)}, by owner ${JSON.stringify(counts.byOwner)}, ${counts.assumed.toLocaleString()} PG&E filed as electric without saying, ${counts.noOpening.toLocaleString()} kept as no dig, ${counts.onBlock.toLocaleString()} on a block, ${groups.size.toLocaleString()} groups`,
  );
  return groups.size;
};
