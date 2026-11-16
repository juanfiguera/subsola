import type { z } from 'zod';
import type { ServiceLotRow, ServiceMaterial, ServiceSide } from '../../src/sources/services';
import { addressMatchKey } from '../../src/sources/streets';
import { everyCell } from '../placement';
import type { DcBuildTools } from '../dc/build';
import { RISK, pointLot, worseSide } from '../dc/services';
import type { seaServiceSchema } from './datasets';

/**
 * Seattle's water services as SPU maps them: a line from its tap on the main to the meter, with
 * the material of SPU's two pieces of it, main to meter and meter to union ("CU/CU"). SPU
 * publishes no Lead and Copper Rule status for them, and nothing on the owner's pipe past the
 * union, so the app reads the material and says where it comes from.
 */

// SPU's material codes. PB is polybutylene here, not lead (Pb).
const PIPES: Record<string, { pipe: string; material: ServiceMaterial }> = {
  CU: { pipe: 'Copper', material: 'non-lead' },
  CS: { pipe: 'Copper', material: 'non-lead' },
  PL: { pipe: 'Plastic', material: 'non-lead' },
  PE: { pipe: 'Polyethylene', material: 'non-lead' },
  PB: { pipe: 'Polybutylene', material: 'non-lead' },
  PVC: { pipe: 'PVC', material: 'non-lead' },
  DI: { pipe: 'Ductile iron', material: 'non-lead' },
  CI: { pipe: 'Cast iron', material: 'non-lead' },
  STL: { pipe: 'Steel', material: 'non-lead' },
  GI: { pipe: 'Galvanized iron', material: 'galvanized' },
  GS: { pipe: 'Galvanized steel', material: 'galvanized' },
  // Iron and threaded ("screw") pipe may or may not be galvanized; SPU doesn't say.
  I: { pipe: 'Iron', material: 'unknown' },
  SP: { pipe: 'Screw pipe', material: 'unknown' },
  LEAD: { pipe: 'Lead', material: 'lead' },
};

/** One of SPU's two pieces of a service, from its code ("GI"). */
export const seaServicePiece = (code: string | undefined): ServiceSide => {
  const known = PIPES[code?.trim().toUpperCase() ?? ''];
  // Nobody has dug to check: it's SPU's records, so never verified.
  return known
    ? { material: known.material, verified: false, pipe: known.pipe }
    : { material: 'unknown', verified: false, pipe: 'Not recorded' };
};

/**
 * A whole service: both of SPU's pieces, and what the line is. Galvanized on either piece makes
 * the line galvanized, which SPU has found with lead goosenecks at the main; a piece SPU hasn't
 * recorded leaves it unknown.
 */
export const seaServiceLine = (material: string | null | undefined) => {
  const [toMeter, toUnion] = (material ?? '').split('/');
  const publicSide = seaServicePiece(toMeter);
  const privateSide = seaServicePiece(toUnion);
  return { material: worseSide(publicSide, privateSide).material, publicSide, privateSide };
};

/** "2872100365" to "287210-0365", King County's major and minor parcel number. */
export const formatPin = (pin: string) =>
  /^\d{10}$/.test(pin) ? `${pin.slice(0, 6)}-${pin.slice(6)}` : pin;

/** "0.75" to 0.75; services run from 3/4 in to a few inches. */
export const serviceSizeIn = (diameter: string | null | undefined) => {
  const size = Number(diameter);
  return size > 0 && size <= 16 ? size : null;
};

/**
 * Each address keeps its worst service, so every address can still find its own. The meter end
 * stands in for the lot, and the tap is kept so the line is drawn from where it really leaves
 * the main.
 */
export const buildSeaServices = async (
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
  for await (const raw of readRows('seaServiceLines')) {
    const row = raw as z.infer<typeof seaServiceSchema>;
    const points = row.geometry.paths.flat();
    const tap = points[0];
    const meter = points.at(-1);
    if (!tap || !meter) continue;
    counts.read += 1;
    const { material, publicSide, privateSide } = seaServiceLine(row.MATERIAL);
    counts[material] += 1;
    const address = row.LOCATION?.trim() ?? '';
    const pin = row.PIN?.trim() || null;
    const key = `${pin ?? ''}|${addressMatchKey(address) ?? `service ${row.OBJECTID}`}`;
    const kept = byAddress.get(key);
    if (kept && RISK[kept.material as ServiceMaterial] >= RISK[material]) continue;
    const size = serviceSizeIn(row.DIAMETER);
    const year = row.INSTALL_YR && row.INSTALL_YR > 1800 ? row.INSTALL_YR : null;
    byAddress.set(key, {
      // Unique, since the app keys lots by it; the parcel number leads, for the report.
      tbbl: pin ? `${formatPin(pin)}#${row.OBJECTID}` : `service ${row.OBJECTID}`,
      address,
      material,
      record_ty: material === 'unknown' ? 'No information' : 'SPU records',
      the_geom: {
        type: 'MultiPolygon',
        coordinates: [pointLot([meter[0]!, meter[1]!])],
      },
      source: 'seaServiceLines',
      public_side: publicSide,
      private_side: privateSide,
      tap: [tap[0]!, tap[1]!],
      ...(size ? { size_in: size } : {}),
      ...(year ? { installed_year: year } : {}),
    });
  }

  for (const row of byAddress.values())
    for (const [cell] of everyCell(row, row.the_geom.coordinates))
      await shards.add(cell.key, 'serviceLines', row);
  const share = (n: number) => `${((n / Math.max(1, counts.read)) * 100).toFixed(1)}%`;
  console.log(
    `seaServiceLines: ${counts.read.toLocaleString()} services (${counts.lead} lead, ${counts.galvanized.toLocaleString()} galvanized ${share(counts.galvanized)}, ${counts.unknown.toLocaleString()} unknown ${share(counts.unknown)}), ${byAddress.size.toLocaleString()} addresses drawn`,
  );
};
