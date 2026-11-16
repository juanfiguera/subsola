import type { z } from 'zod';
import type { ServiceLotRow, ServiceMaterial, ServiceSide } from '../../src/sources/services';
import { gridCellOf } from '../../src/grid';
import { inPolygon } from '../../src/geo';
import { everyCell } from '../placement';
import { ringsToPolygons, type DcBuildTools } from './build';
import type { dcLotSchema, dcServiceSchema } from './datasets';

type Ring = [number, number][];

/**
 * One side of a DC Water service line, from its category ("Verified Lead") and pipe type. DC
 * Water files galvanized iron under lead, because galvanized pipe downstream of lead takes it up
 * and has to be replaced too; NYC's inventory calls that galvanized, and so does the app.
 */
export const dcServiceSide = (
  category: string | null | undefined,
  pipe: string | null | undefined,
): ServiceSide => {
  const named = pipe?.trim() && pipe.trim() !== 'No Information' ? pipe.trim() : 'Not recorded';
  const verified = /^verified/i.test(category ?? '');
  const material: ServiceMaterial = /non-lead/i.test(category ?? '')
    ? 'non-lead'
    : /lead/i.test(category ?? '')
      ? /galvanized/i.test(named) && !/lead/i.test(named)
        ? 'galvanized'
        : 'lead'
      : 'unknown';
  return { material, verified, pipe: named };
};

export const RISK: Record<ServiceMaterial, number> = {
  lead: 3,
  galvanized: 2,
  unknown: 1,
  'non-lead': 0,
};

/** The side that matters more to someone drinking from the line. */
export const worseSide = (a: ServiceSide, b: ServiceSide) =>
  RISK[b.material] > RISK[a.material] ? b : a;

const basisOf = (side: ServiceSide) =>
  side.material === 'unknown' ? 'No information' : side.verified ? 'Verified' : 'Suspected';

// A premise point off every lot (some sit in the street out front) still gets a small lot of
// its own, so its line is drawn: about the frontage of a row house.
const POINT_LOT_DEG = 0.00003;

export const pointLot = ([x, y]: [number, number]): Ring[] => [
  [
    [x - POINT_LOT_DEG, y - POINT_LOT_DEG],
    [x - POINT_LOT_DEG, y + POINT_LOT_DEG],
    [x + POINT_LOT_DEG, y + POINT_LOT_DEG],
    [x + POINT_LOT_DEG, y - POINT_LOT_DEG],
    [x - POINT_LOT_DEG, y - POINT_LOT_DEG],
  ],
];

/**
 * DC Water's service lines, one per premise, as points. Each is matched to the tax lot it sits
 * in so its line is drawn from the lot like NYC's; a lot with several premises keeps the worst.
 */
export const buildDcServices = async (
  readRows: DcBuildTools['readRows'],
  shards: DcBuildTools['shards'],
) => {
  const lots = new Map<string, Ring[][]>();
  const lotsByCell = new Map<string, { ssl: string; polygon: Ring[] }[]>();
  for await (const raw of readRows('dcLots')) {
    const row = raw as z.infer<typeof dcLotSchema>;
    const ssl = row.SSL.replace(/\s+/g, ' ').trim();
    const polygons = ringsToPolygons(row.geometry.rings);
    if (!polygons.length) continue;
    lots.set(ssl, polygons);
    for (const [cell] of everyCell(null, polygons)) {
      const list = lotsByCell.get(cell.key) ?? [];
      list.push(...polygons.map((polygon) => ({ ssl, polygon })));
      lotsByCell.set(cell.key, list);
    }
  }

  const byLot = new Map<string, ServiceLotRow>();
  const counts = { read: 0, onLot: 0 };
  for await (const raw of readRows('dcServiceLines')) {
    const row = raw as z.infer<typeof dcServiceSchema>;
    counts.read += 1;
    const point: [number, number] = [row.geometry.x, row.geometry.y];
    const lot = lotsByCell
      .get(gridCellOf(point).key)
      ?.find(({ polygon }) => inPolygon(point, polygon));
    if (lot) counts.onLot += 1;
    const key = lot?.ssl ?? `premise ${row.OBJECTID}`;
    const publicSide = dcServiceSide(row.Pub_Display_Category, row.PublicServiceMaterialType);
    const privateSide = dcServiceSide(row.Priv_Display_Category, row.PrivateServiceMaterialType);
    const worse = worseSide(publicSide, privateSide);
    const kept = byLot.get(key);
    if (
      kept &&
      RISK[worseSide(kept.public_side!, kept.private_side!).material] >= RISK[worse.material]
    )
      continue;
    byLot.set(key, {
      tbbl: key,
      address: row.PremiseAddress?.trim() ?? '',
      material: worse.material,
      record_ty: basisOf(worse),
      the_geom: {
        type: 'MultiPolygon',
        coordinates: lot ? lots.get(lot.ssl)! : [pointLot(point)],
      },
      source: 'dcServiceLines',
      public_side: publicSide,
      private_side: privateSide,
    });
  }

  for (const row of byLot.values())
    for (const [cell] of everyCell(row, row.the_geom.coordinates))
      await shards.add(cell.key, 'serviceLines', row);
  console.log(
    `dcServiceLines: ${counts.read.toLocaleString()} premises, ${counts.onLot.toLocaleString()} on a tax lot, ${byLot.size.toLocaleString()} lots drawn`,
  );
};
