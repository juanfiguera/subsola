import type { Geometry, Position } from 'geojson';
import type { z } from 'zod';
import { permitGroupFeature, type PermitRecord } from '../../src/sources/permits';
import { streetMatchKey } from '../../src/sources/streets';
import { gridCellOf } from '../../src/grid';
import { DAL_BOROUGH } from '../../src/sources/dalGeocode';
import { everyCell, middleCell } from '../placement';
import { ringsToPolygons, type DcBuildTools } from '../dc/build';
import { createBlockIndex, permitStreet, type DcBlock } from '../dc/blocks';
import { chiAddressBlock, type ChiRange } from '../chi/streets';
import {
  DAL_BOUNDS,
  type dalBuildingSchema,
  type dalPermitLineSchema,
  type dalPermitPointSchema,
  type dalPermitSchema,
  type dalStreetSchema,
} from './datasets';
import { classifyDalPermit, dalContractor, isDalSkip, OTHER_HOLDER, type DalSkip } from './permits';
import { buildDalServices } from './services';

/**
 * Writes Dallas into the same cells as the other cities: the city's street centerlines, FEMA's
 * building footprints, the right of way permits that cut the street for a utility, grouped by
 * block and utility, and Dallas Water Utilities' service line inventory by address. Dallas
 * publishes no pipes, manholes or inlets, so the lines under the street come from permits, as in
 * Chicago. See docs/regions/dal.md.
 */

// Flat meters around the middle of the city, for finding a permit's block.
const DAL_MIDDLE: [number, number] = [-96.8, 32.8];

// Permits start in November 2021; some are issued for a day weeks ahead, which stands as
// scheduled work, and a year far off is a typing slip.
const FIRST_YEAR = 2020;
const LAST_YEAR = new Date().getUTCFullYear() + 3;

const isoDate = (millis: number | null | undefined) => {
  if (!millis) return undefined;
  const date = new Date(millis);
  const year = date.getUTCFullYear();
  return year >= FIRST_YEAR && year <= LAST_YEAR ? date.toISOString().slice(0, 10) : undefined;
};

// "2653 CUSTER DR" as people write it: "2653 Custer Dr".
const tidy = (name: string) =>
  name
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_, space: string, letter: string) => space + letter.toUpperCase());

/** "PREFIX NAME TYPE SUFFIX", as the centerline and the address points both write it. */
export const dalStreetName = (
  row: Pick<z.infer<typeof dalStreetSchema>, 'prefix' | 'name' | 'type' | 'suffix'>,
) =>
  row.name?.trim()
    ? [row.prefix, row.name, row.type, row.suffix]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(' ')
    : '';

/**
 * A permit's work sites, "2653 CUSTER DR, DALLAS, 75216" or "11200-11600 DRUMMOND DR, 3600 PARADER
 * CT", to each site's street and first number, how the first reads, and how many other streets
 * it names.
 */
export const dalPermitSite = (locations: string | null | undefined) => {
  const parts = (locations ?? '')
    .split(',')
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter((part) => /^\d/.test(part) && /[A-Z]/i.test(part));
  const first = parts[0];
  if (!first) return null;
  const sites = parts.flatMap((part) => {
    const street = permitStreet(part);
    return street ? [{ street, number: Number(/^(\d+)/.exec(part)?.[1]) }] : [];
  });
  return { sites, place: tidy(first), others: parts.length - 1 };
};

const middleOf = (path: Position[]): [number, number] | null => {
  const middle = path[Math.floor(path.length / 2)];
  return middle ? [middle[0]!, middle[1]!] : null;
};

export const buildDal = async ({ shardDataset, readRows, shards }: DcBuildTools) => {
  const blocks: DcBlock[] = [];
  const ranges: ChiRange[] = [];
  // The cells the city's own streets reach. FEMA's footprints and DWU's inventory reach past the
  // city line, and only what falls in these cells is kept.
  const cityCells = new Set<string>();
  // The two datasets number their segments apart, so an arterial's key carries an "m".
  for (const [name, prefix] of [
    ['dalStreets', ''],
    ['dalMajorStreets', 'm'],
  ] as const)
    await shardDataset(
      name,
      (row: z.infer<typeof dalStreetSchema>) => {
        const paths = row.the_geom?.coordinates;
        const street = dalStreetName(row);
        if (!paths?.length || !street) return [];
        const key = `${prefix}${row.objectid}`;
        blocks.push({ key, street, path: paths.flat() });
        ranges.push({ key, street: streetMatchKey(street), row });
        const placements = everyCell(
          {
            full_street_name: street,
            borough: DAL_BOROUGH,
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
    'dalBuildings',
    (row: z.infer<typeof dalBuildingSchema>) => {
      const polygons = ringsToPolygons(row.geometry.rings as [number, number][][]);
      if (!polygons.length) return [];
      const placed = middleCell(
        { the_geom: { type: 'MultiPolygon', coordinates: polygons } },
        polygons,
      );
      return placed.filter(([cell]) => cityCells.has(cell.key));
    },
    'buildings',
  );

  await buildDalServices(readRows, shards, cityCells);

  // Each permit's shape, by file number: the middle of its line or its point.
  const shapes = new Map<string, { at: [number, number]; line: boolean }>();
  for await (const raw of readRows('dalPermitLines')) {
    const row = raw as z.infer<typeof dalPermitLineSchema>;
    const at = middleOf(row.geometry.paths.flat());
    if (row.EXTERNALFILENUM && at) shapes.set(row.EXTERNALFILENUM, { at, line: true });
  }
  for await (const raw of readRows('dalPermitPoints')) {
    const row = raw as z.infer<typeof dalPermitPointSchema>;
    if (row.EXTERNALFILENUM && !shapes.has(row.EXTERNALFILENUM))
      shapes.set(row.EXTERNALFILENUM, { at: [row.geometry.x, row.geometry.y], line: false });
  }

  return groupDalPermits(readRows('dalPermits'), blocks, ranges, shapes, shards);
};

const inDallas = ([lng, lat]: [number, number]) => {
  const [west, south, east, north] = DAL_BOUNDS;
  return lng >= west && lng <= east && lat >= south && lat <= north;
};

// The pick list's reasons in words that read as a kind of permit.
const REASONS: Record<string, string> = {
  'Repair Existing Service': 'Repair of an existing service',
  'New Service': 'New service',
  'New Line or Multiple Adjustments': 'New line or several adjustments',
  Exploration: 'Exploration (locating a line)',
  'Stop Service or Abandon Line': 'Stopping a service or abandoning a line',
  Adjustment: 'Adjustment',
};

/** Groups the permits by block and utility, as the other cities' are. Returns how many groups. */
const groupDalPermits = async (
  rows: AsyncIterable<unknown>,
  blocks: DcBlock[],
  ranges: ChiRange[],
  shapes: Map<string, { at: [number, number]; line: boolean }>,
  shards: DcBuildTools['shards'],
) => {
  const nearestBlock = createBlockIndex(blocks, DAL_MIDDLE);
  const byAddress = chiAddressBlock(ranges);
  const blockByKey = new Map(blocks.map((block) => [block.key, block]));
  const groups = new Map<string, { geometry: Geometry; records: Map<string, PermitRecord> }>();
  const counts = {
    read: 0,
    skipped: {} as Partial<Record<DalSkip, number>>,
    kept: 0,
    noPlace: 0,
    noOpening: 0,
    assumed: 0,
    byLine: 0,
    byPoint: 0,
    byAddress: 0,
    atShape: 0,
    byUtility: {} as Record<string, number>,
  };
  for await (const raw of rows) {
    const row = raw as z.infer<typeof dalPermitSchema>;
    counts.read += 1;
    const work = classifyDalPermit(row.ROWIMPROVEMENTREPAIR, row.holder, row);
    if (isDalSkip(work) || !row.EXTERNALFILENUM) {
      const why: DalSkip = isDalSkip(work) ? work : 'not a utility';
      counts.skipped[why] = (counts.skipped[why] ?? 0) + 1;
      continue;
    }
    const site = dalPermitSite(row.LOCATIONNAMES);
    const sites = site?.sites ?? [];
    const shape = shapes.get(row.EXTERNALFILENUM);
    const at = shape && inDallas(shape.at) ? shape.at : null;
    // The shape's middle, on a street the permit names, finds the block. Without one, the
    // address on the centerline's ranges does; a permit naming several streets tries each.
    let block: DcBlock | null = null;
    if (at)
      for (const { street } of sites.length ? sites : [{ street: null }]) {
        block = nearestBlock(at, street);
        if (block) break;
      }
    if (block) counts[shape!.line ? 'byLine' : 'byPoint'] += 1;
    else
      for (const { street, number } of sites) {
        const key = byAddress(street, number);
        block = key ? (blockByKey.get(key) ?? null) : null;
        if (block) {
          counts.byAddress += 1;
          break;
        }
      }
    // Still nothing: a shape off every street the permit names (an alley, a parcel set far back)
    // stands as a point of its own, as Denver's do.
    if (!block && !at) {
      counts.noPlace += 1;
      continue;
    }
    if (!block) counts.atShape += 1;
    counts.kept += 1;
    if (work.noOpening) counts.noOpening += 1;
    else counts.byUtility[work.utility] = (counts.byUtility[work.utility] ?? 0) + 1;
    if (work.assumed) counts.assumed += 1;

    const place = block ? block.key : `${at![0].toFixed(5)},${at![1].toFixed(5)}`;
    const key = `${work.utility}|dal|${place}`;
    const group = groups.get(key) ?? {
      geometry: (block
        ? { type: 'LineString', coordinates: block.path }
        : { type: 'Point', coordinates: at! }) as Geometry,
      records: new Map(),
    };
    const reason = row.ROWREASONFORJOB?.trim();
    const kind =
      work.noOpening === 'cross bore check'
        ? 'Sewer camera check for gas line bores'
        : work.noOpening === 'paving'
          ? 'Paving after a utility dig'
          : `${(reason && REASONS[reason]) || 'Right of way permit'}${row.ROWISEMERGENCYREPAIR === 'Yes' ? ', emergency' : ''}`;
    const permittee =
      work.owner === OTHER_HOLDER
        ? (dalContractor(row.ALLCONTRACTORSNAME) ?? OTHER_HOLDER)
        : work.owner;
    const street = site
      ? site.others
        ? `${site.place} and ${site.others} other ${site.others === 1 ? 'street' : 'streets'}`
        : site.place
      : '';
    group.records.set(row.EXTERNALFILENUM, {
      permitNumber: row.EXTERNALFILENUM,
      utility: work.utility,
      type: work.assumed ? `${kind}, water or sewer not stated` : kind,
      permittee,
      issued: isoDate(row.ISSUEDATE),
      workStart: isoDate(row.ROWREQUESTEDSTARTDATE),
      workEnd: isoDate(row.ROWESTIMATEDCOMPLETIONDATE),
      status: row.STATUSDESCRIPTION?.trim() || undefined,
      street,
      purpose: undefined,
      locationNote: undefined,
      mentionsMain: Boolean(row.main) && (work.utility === 'water' || work.utility === 'sewer'),
      dataset: 'dalPermits',
      ...(work.noOpening && { noOpening: true as const }),
    });
    groups.set(key, group);
  }
  for (const [key, { geometry, records }] of groups) {
    const feature = permitGroupFeature(key, geometry, [...records.values()]);
    const anchor =
      geometry.type === 'Point'
        ? geometry.coordinates
        : (geometry as { coordinates: Position[] }).coordinates[
            Math.floor((geometry as { coordinates: Position[] }).coordinates.length / 2)
          ];
    if (!anchor) continue;
    await shards.add(gridCellOf(anchor).key, 'permitGroups', feature);
  }
  console.log(
    `dalPermits: ${counts.kept.toLocaleString()} utility permits placed of ${counts.read.toLocaleString()} (left out ${JSON.stringify(counts.skipped)}, ${counts.noPlace.toLocaleString()} on no block), digs by utility ${JSON.stringify(counts.byUtility)}, ${counts.noOpening.toLocaleString()} kept as no dig (sewer camera checks, paving), ${counts.assumed.toLocaleString()} DWU filed as water without saying, ${counts.byLine.toLocaleString()} placed on a block by line, ${counts.byPoint.toLocaleString()} by point and ${counts.byAddress.toLocaleString()} by address range, ${counts.atShape.toLocaleString()} left at their own point off every block, ${groups.size.toLocaleString()} groups`,
  );
  return groups.size;
};
