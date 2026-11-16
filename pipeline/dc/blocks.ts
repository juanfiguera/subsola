import { createFrame, closestOnPolyline, type Vec2 } from '../../src/scene/local';
import { streetMatchKey } from '../../src/sources/streets';

/**
 * DDOT's Roadway Blocks run intersection to intersection, the unit Subsola groups permits by.
 * A permit gives an address or "800 - 899 BLOCK OF F STREET NW" and a point; it belongs to the
 * nearest block on the street it names.
 */

export interface DcBlock {
  key: string;
  street: string;
  path: [number, number][];
}

// Permit points sit on the address or the street; a block's line is the street's middle.
const REACH_M = 40;
const BUCKET_M = 100;

// Flat meters around the middle of the District; under a centimeter of error at its edges.
const DC_MIDDLE: [number, number] = [-77.02, 38.9];

/** "800 - 899 BLOCK OF F STREET NW" or "701 HOWARD ROAD SE" to the street, "F STREET NW". */
export const permitStreet = (address: string | null | undefined): string | null => {
  if (!address) return null;
  const street = address
    .trim()
    .replace(/^\d+\s*-\s*\d+\s+BLOCK\s+OF\s+/i, '')
    .replace(/^[\d-]+[A-Z]?\s+/i, '')
    .replace(/\s+/g, ' ');
  return street || null;
};

/** Blocks by where they run; `middle` is the city's, for flat meters around it. */
export const createBlockIndex = (blocks: DcBlock[], middle: [number, number] = DC_MIDDLE) => {
  const frame = createFrame(middle);
  const buckets = new Map<string, { block: DcBlock; local: Vec2[] }[]>();
  const keyOf = (x: number, y: number) => `${Math.floor(x / BUCKET_M)}|${Math.floor(y / BUCKET_M)}`;
  for (const block of blocks) {
    const local = block.path.map((point) => frame.toLocal(point));
    const keys = new Set(local.map(([x, y]) => keyOf(x, y)));
    // Long blocks pass through buckets between their vertices too.
    for (let i = 1; i < local.length; i++) {
      const [a, b] = [local[i - 1]!, local[i]!];
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (BUCKET_M / 2));
      for (let s = 1; s < steps; s++)
        keys.add(keyOf(a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps));
    }
    for (const key of keys) {
      const bucket = buckets.get(key);
      if (bucket) bucket.push({ block, local });
      else buckets.set(key, [{ block, local }]);
    }
  }
  const nameKeys = new Map(blocks.map((block) => [block.key, streetMatchKey(block.street)]));

  /**
   * The block on `street` nearest `lngLat`, or failing that, any block right at the point (a
   * permit whose street name doesn't match DDOT's, but sits on a block). Null when nothing's near.
   */
  return (lngLat: [number, number], street: string | null): DcBlock | null => {
    const point = frame.toLocal(lngLat);
    const wanted = street ? streetMatchKey(street) : null;
    let named: { block: DcBlock; distance: number } | null = null;
    let any: { block: DcBlock; distance: number } | null = null;
    const [bx, by] = [Math.floor(point[0] / BUCKET_M), Math.floor(point[1] / BUCKET_M)];
    const seen = new Set<string>();
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const { block, local } of buckets.get(`${bx + dx}|${by + dy}`) ?? []) {
          if (seen.has(block.key)) continue;
          seen.add(block.key);
          const { distance } = closestOnPolyline(local, point);
          if (distance > REACH_M) continue;
          if (!any || distance < any.distance) any = { block, distance };
          if (wanted && nameKeys.get(block.key) === wanted && (!named || distance < named.distance))
            named = { block, distance };
        }
    if (named) return named.block;
    // Without a name match, only trust a block the point is practically on.
    return any && any.distance <= REACH_M / 4 ? any.block : null;
  };
};
