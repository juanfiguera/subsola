import type { z } from 'zod';
import type { ServiceLotRow, ServiceMaterial, ServiceSide } from '../../src/sources/services';
import { addressMatchKey } from '../../src/sources/streets';
import { everyCell } from '../placement';
import type { DcBuildTools } from '../dc/build';
import { RISK, pointLot, worseSide } from '../dc/services';
import { WHOLE_LINE, sdServiceSide } from '../sd/services';
import type { dalServiceSchema } from './datasets';

/**
 * Dallas Water Utilities' service line inventory, filed on the EPA's template like San Diego's:
 * one point per service, with the city's side and the customer's side each given a material and
 * how it's known. See docs/regions/dal.md.
 */

// Records of the pipe itself, beyond the ones San Diego's inventory uses: the plans it was built
// to, and DWU's "deadhead" service cards. A side read off the standard drawings is a guess.
const DAL_RECORDS = new Set(['Construction Plans', 'Deadhead Card']);

/** One side, as San Diego's are read, and verified too where DWU marks it so. */
export const dalServiceSide = (
  material: string | null | undefined,
  status: number | null | undefined,
  source: string | null | undefined,
  verified: string | null | undefined,
): ServiceSide => {
  const side = sdServiceSide(material, status, source, null);
  const recorded = DAL_RECORDS.has(source?.trim() ?? '') || verified?.trim() === 'Yes';
  return { ...side, verified: side.verified || (side.material !== 'unknown' && recorded) };
};

/** A whole line: both sides, and the city's own call on it where it makes one. */
export const dalServiceLine = (row: z.infer<typeof dalServiceSchema>) => {
  const publicSide = dalServiceSide(
    row.utilmaterial,
    row.utilstatus,
    row.utilsource,
    row.utilverified,
  );
  const privateSide = dalServiceSide(
    row.custmaterial,
    row.custstatus,
    row.custsource,
    row.custverified,
  );
  const material =
    WHOLE_LINE[row.bothsidesstatus?.trim() ?? ''] ?? worseSide(publicSide, privateSide).material;
  const basis =
    material === 'unknown'
      ? 'No information'
      : publicSide.verified && privateSide.verified
        ? 'Verified'
        : 'Suspected';
  return { material, basis, publicSide, privateSide };
};

/**
 * The inventory by address, each keeping its worst line. Only points in cells the city's streets
 * reach are kept, the same test the buildings get.
 */
export const buildDalServices = async (
  readRows: DcBuildTools['readRows'],
  shards: DcBuildTools['shards'],
  cityCells: Set<string>,
) => {
  const byAddress = new Map<string, ServiceLotRow>();
  const counts: Record<ServiceMaterial | 'read' | 'outside', number> = {
    read: 0,
    outside: 0,
    lead: 0,
    galvanized: 0,
    unknown: 0,
    'non-lead': 0,
  };
  for await (const raw of readRows('dalServiceLines')) {
    const row = raw as z.infer<typeof dalServiceSchema>;
    counts.read += 1;
    const lot = pointLot([row.geometry.x, row.geometry.y]);
    if (!everyCell(null, [lot]).some(([cell]) => cityCells.has(cell.key))) {
      counts.outside += 1;
      continue;
    }
    const { material, basis, publicSide, privateSide } = dalServiceLine(row);
    counts[material] += 1;
    const address = row.address?.trim() ?? '';
    const key = addressMatchKey(address) ?? `service ${row.OBJECTID}`;
    const kept = byAddress.get(key);
    if (kept && RISK[kept.material as ServiceMaterial] >= RISK[material]) continue;
    byAddress.set(key, {
      // Unique, since the app keys lots by it. The inventory names no parcel.
      tbbl: `service ${row.OBJECTID}`,
      address,
      material,
      record_ty: basis,
      the_geom: { type: 'MultiPolygon', coordinates: [lot] },
      source: 'dalServiceLines',
      public_side: publicSide,
      private_side: privateSide,
      ...(row.yearstructbuilt && row.yearstructbuilt > 1800
        ? { built_year: row.yearstructbuilt }
        : {}),
    });
  }

  for (const row of byAddress.values())
    for (const [cell] of everyCell(row, row.the_geom.coordinates))
      await shards.add(cell.key, 'serviceLines', row);
  console.log(
    `dalServiceLines: ${counts.read.toLocaleString()} services, ${counts.outside.toLocaleString()} outside the city's streets; ${counts.lead} lead, ${counts.galvanized} galvanized to replace, ${counts.unknown.toLocaleString()} unknown, ${counts['non-lead'].toLocaleString()} not lead; ${byAddress.size.toLocaleString()} addresses drawn`,
  );
  return counts;
};
