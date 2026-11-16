import type { z } from 'zod';
import type { ServiceLotRow, ServiceMaterial } from '../../src/sources/services';
import { addressMatchKey } from '../../src/sources/streets';
import { everyCell } from '../placement';
import type { DcBuildTools } from '../dc/build';
import { pointLot } from '../dc/services';
import type { denServiceSchema } from './datasets';

/**
 * Denver Water's lead service line inventory, the layer behind its own address lookup: one point
 * per premise with one of four categories for the whole line, from the building's age and Denver
 * Water's records. It doesn't split the line into Denver Water's part and the owner's, and names
 * no pipe material. See docs/regions/den.md.
 */

export type DenLeadCategory = 'Confirmed lead' | 'Likely lead' | 'Unlikely lead' | 'Not lead';

/**
 * A category as Denver Water words it, to the app's material and Denver Water's own call. A line
 * that is only likely lead is still unknown: nobody has seen it, though Denver Water counts it in
 * its replacement program. Confirmed includes galvanized pipe that is or was downstream of lead.
 */
export const denLeadCategory = (
  text: string | null | undefined,
): { material: ServiceMaterial; category: DenLeadCategory } | null => {
  const value = text?.trim().toLowerCase() ?? '';
  if (value.startsWith('confirmed lead')) return { material: 'lead', category: 'Confirmed lead' };
  if (value.startsWith('unknown; likely')) return { material: 'unknown', category: 'Likely lead' };
  if (value.startsWith('unknown; unlikely'))
    return { material: 'unknown', category: 'Unlikely lead' };
  if (value.startsWith('no lead')) return { material: 'non-lead', category: 'Not lead' };
  return null;
};

// Worst first, where an address has two lines: in the same order as the materials, with likely
// lead ahead of unlikely within unknown.
const CATEGORY_RISK: Record<DenLeadCategory, number> = {
  'Not lead': 0,
  'Unlikely lead': 1,
  'Likely lead': 2,
  'Confirmed lead': 3,
};

/**
 * An address the way it's said, as the app's geocoder names it: Denver Water writes the "N" of a
 * north-side address on some lines ("15 N LOGAN ST") and not others ("4771 VINE ST").
 */
export const denSpokenAddress = (address: string) =>
  address.trim().replace(/^(\d+[A-Z]?)\s+N\s+(?=\S)/i, '$1 ');

/**
 * The inventory by address. Its point sits on the building's parcel; each address keeps its worst
 * line. Only points in cells the city's streets reach are kept: Denver Water serves the suburbs
 * around the city too.
 */
export const buildDenServices = async (
  readRows: DcBuildTools['readRows'],
  shards: DcBuildTools['shards'],
  cityCells: Set<string>,
) => {
  const byAddress = new Map<string, ServiceLotRow>();
  const counts: Record<DenLeadCategory | 'read' | 'outside' | 'unread', number> = {
    read: 0,
    outside: 0,
    unread: 0,
    'Confirmed lead': 0,
    'Likely lead': 0,
    'Unlikely lead': 0,
    'Not lead': 0,
  };
  for await (const raw of readRows('denServiceLines')) {
    const row = raw as z.infer<typeof denServiceSchema>;
    counts.read += 1;
    const known = denLeadCategory(row.lsli_final_lead_cat);
    if (!known) {
      counts.unread += 1;
      continue;
    }
    const lot = pointLot([row.geometry.x, row.geometry.y]);
    const placements = everyCell(null, [lot]).filter(([cell]) => cityCells.has(cell.key));
    if (!placements.length) {
      counts.outside += 1;
      continue;
    }
    counts[known.category] += 1;
    const address = denSpokenAddress(row.prem_full_addr ?? '');
    const key = addressMatchKey(address) ?? `premise ${row.OBJECTID}`;
    const kept = byAddress.get(key);
    if (kept && CATEGORY_RISK[kept.record_ty as DenLeadCategory] >= CATEGORY_RISK[known.category])
      continue;
    byAddress.set(key, {
      // Unique, since the app keys lots by it. Denver Water names no parcel.
      tbbl: `premise ${row.OBJECTID}`,
      address,
      material: known.material,
      record_ty: known.category,
      the_geom: { type: 'MultiPolygon', coordinates: [lot] },
      source: 'denServiceLines',
      ...(row.parcelyearbuilt && row.parcelyearbuilt > 1800
        ? { built_year: row.parcelyearbuilt }
        : {}),
    });
  }

  for (const row of byAddress.values())
    for (const [cell] of everyCell(row, row.the_geom.coordinates))
      await shards.add(cell.key, 'serviceLines', row);
  console.log(
    `denServiceLines: ${counts.read.toLocaleString()} premises, ${counts.outside.toLocaleString()} outside the city's streets, ${counts.unread} with no category; in the city ${counts['Confirmed lead'].toLocaleString()} confirmed lead, ${counts['Likely lead'].toLocaleString()} likely lead, ${counts['Unlikely lead'].toLocaleString()} unlikely, ${counts['Not lead'].toLocaleString()} not lead; ${byAddress.size.toLocaleString()} addresses drawn`,
  );
  return counts;
};
