import type { ServiceLot } from '../sources/services';
import type { PipeRun } from './build';
import { closestOnPolyline, pointAlong, ringsOf, type LocalFrame, type Vec2 } from './local';

export type ServiceUtility = 'water' | 'sewer';

/** A lot's own pipe, drawn straight from the main in the street to the front of the lot. */
export interface ServiceLine {
  ref: string;
  utility: ServiceUtility;
  /** On the main. */
  a: Vec2;
  /** On the lot line. */
  b: Vec2;
  depthFt: number;
  lot: ServiceLot;
  /** Water only: where DEP's rule puts the curb valve, if the line crosses a mapped curb. */
  curbValve?: Vec2;
}

// About a wide street plus its sidewalk. A lot farther than this from every drawn main faces a
// street with no permits on record for that utility, and a line to a main on the next street
// would be wrong.
const MAX_REACH_M = 20;
// San Diego maps every main, so the nearest one is the one that serves the line. Its inventory
// places each line by a point inside the lot rather than on the lot line: half of them are more
// than 24 m from a distribution main, nine in ten within 39 m.
const SD_REACH_M = 45;
// Denver Water's points sit inside the lot too, half more than 23 m from the street's centerline
// and three in four within 26 m. Its mains are placed from permits, so a street can have none
// drawn; past this, the nearest one is on the street behind the lot, about 38 m deep.
const DEN_REACH_M = 32;
// Seattle maps where each service leaves the main. The main drawn there is SPU's own, from the
// same map, so the tap sits on it; past this, that main isn't loaded or isn't a distribution main.
const TAP_SNAP_M = 10;
// Water and sewer would leave the same lot at the same spot. Real ones run separately, so the
// sewer is drawn a little way along the frontage.
const SEWER_SHIFT_M = 2;
// DEP requires the curb valve "in the sidewalk area ... eighteen (18) inches from the curb line".
export const CURB_VALVE_FROM_CURB_M = 18 * 0.0254;

/** How far along a→b (0 to 1) it crosses segment c→d, or null if it doesn't. */
const crossingFraction = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): number | null => {
  const [rx, ry] = [b[0] - a[0], b[1] - a[1]];
  const [sx, sy] = [d[0] - c[0], d[1] - c[1]];
  const denominator = rx * sy - ry * sx;
  if (!denominator) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denominator;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
};

/**
 * The curb valve sits 18 inches past the curb the line crosses last on its way to the lot, so
 * on the sidewalk in front of that lot rather than across the street.
 */
export const curbValveOn = (a: Vec2, b: Vec2, curbs: Vec2[][]): Vec2 | undefined => {
  let last: number | null = null;
  for (const curb of curbs) {
    for (let i = 1; i < curb.length; i++) {
      const t = crossingFraction(a, b, curb[i - 1]!, curb[i]!);
      if (t !== null && (last === null || t > last)) last = t;
    }
  }
  if (last === null) return undefined;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const t = Math.min(1, last + CURB_VALVE_FROM_CURB_M / length);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
};

/** Where a lot comes closest to a main: the spot on each, and the gap between them. */
const nearestBetween = (ring: Vec2[], main: Vec2[]) => {
  let best = { vertex: ring[0]!, distance: Infinity };
  for (const vertex of ring) {
    const { distance } = closestOnPolyline(main, vertex);
    if (distance < best.distance) best = { vertex, distance };
  }
  // A vertex is only a corner of the lot; the true nearest spot is usually along an edge.
  const onMain = closestOnPolyline(main, best.vertex).point;
  const onLot = closestOnPolyline([...ring, ring[0]!], onMain).point;
  const settled = closestOnPolyline(main, onLot);
  return { onLot, onMain: settled.point, fraction: settled.fraction, distance: settled.distance };
};

type Box = [number, number, number, number];

const boxOf = (points: Vec2[]): Box => [
  Math.min(...points.map((p) => p[0])),
  Math.min(...points.map((p) => p[1])),
  Math.max(...points.map((p) => p[0])),
  Math.max(...points.map((p) => p[1])),
];

/** The shortest distance between two boxes; 0 when they overlap. */
const boxGap = (a: Box, b: Box) =>
  Math.hypot(Math.max(0, b[0] - a[2], a[0] - b[2]), Math.max(0, b[1] - a[3], a[1] - b[3]));

/** Unit vector along a polyline at a fraction of its length. */
const directionAt = (line: Vec2[], fraction: number): Vec2 => {
  const [x0, y0] = pointAlong(line, Math.max(0, fraction - 0.01));
  const [x1, y1] = pointAlong(line, Math.min(1, fraction + 0.01));
  const length = Math.hypot(x1 - x0, y1 - y0) || 1;
  return [(x1 - x0) / length, (y1 - y0) / length];
};

export const buildServices = (
  frame: LocalFrame,
  lots: ServiceLot[],
  runs: PipeRun[],
  curbs: Vec2[][],
): ServiceLine[] => {
  // Each main's bounding box, so a lot only measures to mains that could be in reach. With the
  // whole area loaded as the camera moves, measuring every lot against every main is too slow.
  const mainsOf = (utility: ServiceUtility) =>
    runs
      .filter((run) => run.utility === utility && run.path.length > 1)
      .map((run) => ({ run, box: boxOf(run.path) }));
  const mains = { water: mainsOf('water'), sewer: mainsOf('sewer') };
  // A service can only cross a curb whose box overlaps its own; most curbs are blocks away.
  const curbBoxes = curbs
    .filter((curb) => curb.length > 1)
    .map((curb) => ({ curb, box: boxOf(curb) }));
  const curbsCrossable = (a: Vec2, b: Vec2) => {
    const box = boxOf([a, b]);
    return curbBoxes.filter((entry) => boxGap(entry.box, box) === 0).map((entry) => entry.curb);
  };
  return lots.flatMap((lot, index) => {
    const ring = ringsOf(lot.lot)[0]?.[0]?.map((p) => frame.toLocal(p));
    if (!ring || ring.length < 3) return [];
    const lotBox = boxOf(ring);
    if (lot.tap) {
      const tap = frame.toLocal(lot.tap);
      const nearest = mains.water
        .filter(({ box }) => boxGap(box, boxOf([tap])) <= TAP_SNAP_M)
        .map(({ run: main }) => ({ main, ...closestOnPolyline(main.path, tap) }))
        .sort((x, y) => x.distance - y.distance)[0];
      if (!nearest || nearest.distance > TAP_SNAP_M) return [];
      const a = nearest.point;
      return [
        {
          ref: `water-service-${index}`,
          utility: 'water',
          a,
          b: closestOnPolyline([...ring, ring[0]!], a).point,
          depthFt: nearest.main.depthFt,
          lot,
        },
      ];
    }
    // DC publishes nothing on house sewers, where NYC has connection permits by lot.
    const nyc = lot.source === 'serviceLines';
    const reach =
      lot.source === 'sdServiceLines'
        ? SD_REACH_M
        : lot.source === 'denServiceLines'
          ? DEN_REACH_M
          : MAX_REACH_M;
    return (nyc ? (['water', 'sewer'] as const) : (['water'] as const)).flatMap(
      (utility): ServiceLine[] => {
        const nearest = mains[utility]
          .filter(({ box }) => boxGap(box, lotBox) <= reach)
          .map(({ run: main }) => ({ main, ...nearestBetween(ring, main.path) }))
          .sort((x, y) => x.distance - y.distance)[0];
        if (!nearest || nearest.distance > reach) return [];
        const shift = utility === 'sewer' ? SEWER_SHIFT_M : 0;
        const [dx, dy] = directionAt(nearest.main.path, nearest.fraction);
        const move = ([x, y]: Vec2): Vec2 => [x + dx * shift, y + dy * shift];
        const [a, b] = [move(nearest.onMain), move(nearest.onLot)];
        return [
          {
            ref: `${utility}-service-${index}`,
            utility,
            a,
            b,
            depthFt: nearest.main.depthFt,
            lot,
            // The 18 in rule is DEP's.
            ...(utility === 'water' && nyc
              ? { curbValve: curbValveOn(a, b, curbsCrossable(a, b)) }
              : {}),
          },
        ];
      },
    );
  });
};
