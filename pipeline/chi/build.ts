import type { Geometry, Position } from 'geojson';
import type { z } from 'zod';
import { permitGroupFeature, type PermitRecord } from '../../src/sources/permits';
import { streetMatchKey } from '../../src/sources/streets';
import { gridCellOf } from '../../src/grid';
import { CHI_BOROUGH } from '../../src/sources/chiGeocode';
import { everyCell, middleCell } from '../placement';
import type { DcBuildTools } from '../dc/build';
import { createBlockIndex, type DcBlock } from '../dc/blocks';
import {
  CHI_BOUNDS,
  type chiBuildingSchema,
  type chiPermitSchema,
  type chiStreetSchema,
} from './datasets';
import { chiAddressBlock, chiStreetName, isDrawnChiStreet, type ChiRange } from './streets';
import { classifyChiPermit, HOLDER_HIDDEN, isChiRestoration, keepsChiWorkType } from './permits';

/**
 * Writes Chicago into the same cells as the other cities: the city's street centerlines and
 * building footprints, and CDOT's public way opening permits that cut the street for a utility,
 * grouped by block and utility. Chicago publishes no pipes, so everything under the street comes
 * from permits, as in New York. See docs/regions/chi.md.
 */

// Flat meters around the middle of the city, for finding a permit's block.
const CHI_MIDDLE: [number, number] = [-87.68, 41.84];

// Real records start in 2013; a few dates are typing slips (1991, 2027).
const FIRST_YEAR = 2010;
const LAST_YEAR = new Date().getUTCFullYear() + 3;

const isoDate = (value: string | null | undefined) => {
  const day = value?.slice(0, 10);
  const year = Number(day?.slice(0, 4));
  return day && year >= FIRST_YEAR && year <= LAST_YEAR ? day : undefined;
};

// "N MENARD AVE" as people write it: "N Menard Ave".
const tidy = (name: string) =>
  name
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_, space: string, letter: string) => space + letter.toUpperCase());

const inChicago = ([lng, lat]: [number, number]) => {
  const [west, south, east, north] = CHI_BOUNDS;
  return lng >= west && lng <= east && lat >= south && lat <= north;
};

export const buildChi = async ({ shardDataset, readRows, shards }: DcBuildTools) => {
  const blocks: DcBlock[] = [];
  const ranges: ChiRange[] = [];
  await shardDataset(
    'chiStreets',
    (row: z.infer<typeof chiStreetSchema>) => {
      const paths = row.the_geom?.coordinates;
      const name = chiStreetName(row);
      if (!paths?.length || !name || !isDrawnChiStreet(row)) return [];
      const path = paths.flat();
      blocks.push({ key: row.objectid, street: name, path });
      ranges.push({ key: row.objectid, street: streetMatchKey(name), row });
      return everyCell(
        {
          full_street_name: name,
          borough: CHI_BOROUGH,
          the_geom: { type: 'MultiLineString', coordinates: paths },
        },
        paths,
      );
    },
    'centerline',
  );

  await shardDataset(
    'chiBuildings',
    (row: z.infer<typeof chiBuildingSchema>) => {
      const polygons = row.the_geom?.coordinates;
      return polygons?.length
        ? middleCell({ the_geom: { type: 'MultiPolygon', coordinates: polygons } }, polygons)
        : [];
    },
    'buildings',
  );

  return groupChiPermits(readRows('chiPermits'), blocks, ranges, shards);
};

/** Groups the permits by block and utility, as the other cities' are. Returns how many groups. */
const groupChiPermits = async (
  rows: AsyncIterable<unknown>,
  blocks: DcBlock[],
  ranges: ChiRange[],
  shards: DcBuildTools['shards'],
) => {
  const nearestBlock = createBlockIndex(blocks, CHI_MIDDLE);
  const byAddress = chiAddressBlock(ranges);
  const blockByKey = new Map(blocks.map((block) => [block.key, block]));
  const groups = new Map<string, { geometry: Geometry; records: Map<string, PermitRecord> }>();
  const counts = {
    read: 0,
    rejected: 0,
    advanceLeftOut: 0,
    restorations: 0,
    noPlace: 0,
    utility: 0,
    assumed: 0,
    holdersHidden: 0,
    byPoint: 0,
    byAddress: 0,
    byUtility: {} as Record<string, number>,
  };
  for await (const raw of rows) {
    const row = raw as z.infer<typeof chiPermitSchema>;
    counts.read += 1;
    const work = classifyChiPermit(row.holder, row);
    if (!work || !row.applicationnumber) {
      counts.rejected += 1;
      continue;
    }
    if (!keepsChiWorkType(row.worktype, work)) {
      counts.advanceLeftOut += 1;
      continue;
    }
    const street = [row.direction, row.streetname, row.suffix]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ');
    const at: [number, number] | null =
      row.longitude && row.latitude ? [Number(row.longitude), Number(row.latitude)] : null;
    // The point is the start of the permit's address range, on the street it names. Where that
    // doesn't find a block, the address range on the centerline does.
    let block = at && inChicago(at) ? nearestBlock(at, street || null) : null;
    if (block) counts.byPoint += 1;
    else {
      const key = byAddress(street, Number(row.streetnumberfrom));
      block = key ? (blockByKey.get(key) ?? null) : null;
      if (block) counts.byAddress += 1;
    }
    if (!block) {
      counts.noPlace += 1;
      continue;
    }
    const restoration = isChiRestoration(row.worktype);
    counts.utility += 1;
    if (restoration) counts.restorations += 1;
    else counts.byUtility[work.utility] = (counts.byUtility[work.utility] ?? 0) + 1;
    if (work.assumed) counts.assumed += 1;
    if (work.owner === HOLDER_HIDDEN) counts.holdersHidden += 1;

    const key = `${work.utility}|chi|${block.key}`;
    const group = groups.get(key) ?? {
      geometry: { type: 'LineString', coordinates: block.path } as Geometry,
      records: new Map(),
    };
    const numbers = [row.streetnumberfrom, row.streetnumberto]
      .map((number) => number?.trim())
      .filter(
        (number, index, all): number is string => Boolean(number) && all.indexOf(number) === index,
      );
    const place = street ? [numbers.join('-'), tidy(street)].filter(Boolean).join(' ') : '';
    const kind = restoration
      ? 'Restoration only'
      : row.worktype === 'WorkInAdv'
        ? 'Opening in the public way, begun before the permit'
        : 'Opening in the public way';
    const issued = isoDate(row.applicationissueddate);
    // A permit opening several stretches of one block is one record.
    const existing = group.records.get(row.applicationnumber);
    group.records.set(row.applicationnumber, {
      permitNumber: row.applicationnumber,
      utility: work.utility,
      type: work.assumed ? `${kind}, water or sewer not stated` : kind,
      permittee: work.owner,
      issued: existing?.issued ?? issued,
      workStart: existing?.workStart ?? isoDate(row.applicationstartdate),
      workEnd: isoDate(row.applicationenddate) ?? existing?.workEnd,
      status: row.applicationstatus?.trim() || undefined,
      street: existing?.street || place,
      purpose: undefined,
      locationNote: undefined,
      mentionsMain: Boolean(existing?.mentionsMain || (row.main && work.utility === 'water')),
      dataset: 'chiPermits',
      ...(restoration && { noOpening: true as const }),
    });
    groups.set(key, group);
  }
  for (const [key, { geometry, records }] of groups) {
    const feature = permitGroupFeature(key, geometry, [...records.values()]);
    const line = (geometry as { coordinates: Position[] }).coordinates;
    const anchor = line[Math.floor(line.length / 2)];
    if (!anchor) continue;
    await shards.add(gridCellOf(anchor).key, 'permitGroups', feature);
  }
  console.log(
    `chiPermits: ${counts.utility.toLocaleString()} utility rows placed of ${counts.read.toLocaleString()} (${counts.rejected.toLocaleString()} not a utility's dig, ${counts.advanceLeftOut.toLocaleString()} paving work in advance, ${counts.noPlace.toLocaleString()} on no block), ${counts.restorations.toLocaleString()} restorations kept as no dig, digs by utility ${JSON.stringify(counts.byUtility)}, ${counts.assumed.toLocaleString()} DWM filed as water without saying, ${counts.holdersHidden.toLocaleString()} holders not shown, ${counts.byPoint.toLocaleString()} placed by point and ${counts.byAddress.toLocaleString()} by address range, ${groups.size.toLocaleString()} groups`,
  );
  return groups.size;
};
