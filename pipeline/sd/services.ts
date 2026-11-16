import type { z } from 'zod';
import type { ServiceLotRow, ServiceMaterial, ServiceSide } from '../../src/sources/services';
import { addressMatchKey } from '../../src/sources/streets';
import { everyCell } from '../placement';
import type { DcBuildTools } from '../dc/build';
import { RISK, pointLot, worseSide } from '../dc/services';
import type { sdServiceSchema } from './datasets';

// The inventory's status codes, used where a side names no material.
const STATUS: Record<number, ServiceMaterial> = {
  0: 'unknown',
  1: 'lead',
  2: 'non-lead',
  3: 'galvanized',
};

// "Non-Lead" and "Lead" alone read in the app's own words ("Not lead").
const PIPES: Record<string, string> = {
  'Non-Lead - Copper': 'Copper',
  'Non-Lead - Plastic': 'Plastic',
  'Non-Lead - Other': 'Non-Lead',
  Lead: 'Lead',
  Galvanized: 'Galvanized',
  'Lead-lined galvanized': 'Lead-lined galvanized',
};
const UNNAMED: Record<ServiceMaterial, string> = {
  lead: 'Lead',
  galvanized: 'Galvanized',
  'non-lead': 'Non-Lead',
  unknown: 'Not recorded',
};

// Sources that are a record of the pipe itself, not a guess at it.
const RECORDS = new Set([
  'Installation record (e.g., tap card)',
  'Installation date is after the lead ban',
  'Service line diameter is greater than 2 inches',
  'Service line repair or replacement record',
  'Previous materials evaluation',
  'Field inspection only with no records',
  'Water sampling only with no records',
]);

// Someone looked at the pipe. "Field Verification Not Required" and "Field Inspection
// Required" both mean nobody has.
const INSPECTED = /visual inspection|cctv|excavation|water quality sampling|inspection (of|near)/i;

/**
 * One side of a San Diego service line, from its material ("Non-Lead - Copper") and status code.
 * The material wins where the two disagree: two lines coded lead are named non-lead, and so is
 * the whole line. Galvanized pipe counts as needing replacement only when the city says so
 * (status 3, downstream of lead); otherwise the EPA files it as non-lead. "Unknown - Unlikely
 * Lead" is still unknown. The inventory marks nearly every side verified, even a predictive
 * model's guess, so verified here means a record of the pipe or someone having looked at it.
 */
export const sdServiceSide = (
  material: string | null | undefined,
  status: number | null | undefined,
  source: string | null | undefined,
  method: string | null | undefined,
): ServiceSide => {
  const named = material?.trim() ?? '';
  const fromStatus = (status != null && STATUS[status]) || 'unknown';
  const kind: ServiceMaterial = !named
    ? fromStatus
    : /^lead/i.test(named)
      ? 'lead'
      : /^galvanized/i.test(named)
        ? fromStatus === 'galvanized'
          ? 'galvanized'
          : 'non-lead'
        : /^non-lead/i.test(named)
          ? 'non-lead'
          : 'unknown';
  const pipe = kind === 'unknown' ? 'Not recorded' : (PIPES[named] ?? UNNAMED[kind]);
  const verified =
    kind !== 'unknown' && (RECORDS.has(source?.trim() ?? '') || INSPECTED.test(method ?? ''));
  return { material: kind, verified, pipe };
};

// The city's own call on the whole line, which the EPA asks for.
const WHOLE_LINE: Record<string, ServiceMaterial> = {
  Lead: 'lead',
  'Galvanized Requiring Replacement': 'galvanized',
  'Non-Lead': 'non-lead',
  Unknown: 'unknown',
};

/**
 * A whole service line: both sides, and what the line is. The city's "Entire Service Line
 * Status" decides that where it's filled in, though a side may still be unknown (some 40 lines
 * are non-lead overall with no material on the owner's side); otherwise the worse side does.
 * Verified only when both sides are.
 */
export const sdServiceLine = (row: z.infer<typeof sdServiceSchema>) => {
  const publicSide = sdServiceSide(
    row.utilmaterial,
    row.utilstatus,
    row.utilsource,
    row.utilverifmethod,
  );
  const privateSide = sdServiceSide(
    row.custmaterial,
    row.custstatus,
    row.custsource,
    row.custverifmethod,
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

/** "5382301200" to "538-230-12-00", as the county writes a parcel number. */
export const formatApn = (apn: string) =>
  /^\d{10}$/.test(apn)
    ? `${apn.slice(0, 3)}-${apn.slice(3, 6)}-${apn.slice(6, 8)}-${apn.slice(8)}`
    : apn;

/**
 * The city's service lines, one row per meter, each with a point. The point mostly sits inside
 * the lot, about 24 m from the street's centerline, rather than at the meter by the curb. A
 * parcel can hold many meters; each address on it keeps its worst line, so every address can
 * still find its own.
 */
export const buildSdServices = async (
  readRows: DcBuildTools['readRows'],
  shards: DcBuildTools['shards'],
) => {
  const byAddress = new Map<string, ServiceLotRow>();
  const counts: Record<ServiceMaterial | 'read', number> = {
    read: 0,
    lead: 0,
    galvanized: 0,
    unknown: 0,
    'non-lead': 0,
  };
  for await (const raw of readRows('sdServiceLines')) {
    const row = raw as z.infer<typeof sdServiceSchema>;
    counts.read += 1;
    const { material, basis, publicSide, privateSide } = sdServiceLine(row);
    counts[material] += 1;
    const address = row.address?.trim() ?? '';
    const apn = row.APN?.trim() || null;
    const key = `${apn ?? ''}|${addressMatchKey(address) ?? `meter ${row.OBJECTID}`}`;
    const kept = byAddress.get(key);
    if (kept && RISK[kept.material as ServiceMaterial] >= RISK[material]) continue;
    byAddress.set(key, {
      // Unique, since the app keys lots by it; the parcel number leads, for the report.
      tbbl: apn ? `${formatApn(apn)}#${row.OBJECTID}` : `meter ${row.OBJECTID}`,
      address,
      material,
      record_ty: basis,
      the_geom: { type: 'MultiPolygon', coordinates: [pointLot([row.geometry.x, row.geometry.y])] },
      source: 'sdServiceLines',
      public_side: publicSide,
      private_side: privateSide,
    });
  }

  for (const row of byAddress.values())
    for (const [cell] of everyCell(row, row.the_geom.coordinates))
      await shards.add(cell.key, 'serviceLines', row);
  console.log(
    `sdServiceLines: ${counts.read.toLocaleString()} meters (${counts.lead} lead, ${counts.galvanized} galvanized to replace, ${counts.unknown} unknown), ${byAddress.size.toLocaleString()} addresses drawn`,
  );
};
