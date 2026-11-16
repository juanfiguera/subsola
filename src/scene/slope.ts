import { closestOnPolyline, polylineLength, type Vec2 } from './local';

/**
 * Which way a sewer main probably drains. NYC sewers mostly run by gravity, so they fall with
 * the street; the city's planimetric spot elevations (street centerline, every intersection,
 * mid-block and every 200 ft) give the street's fall. Trunk sewers and force mains don't always
 * follow it, so this is an estimate and says so.
 */
export interface SewerFlow {
  /** 1 when it drains from the first point of the run's path to the last, -1 the other way. */
  direction: 1 | -1;
  highFt: number;
  lowFt: number;
  /** Unit vector along the ground, downhill. */
  downhill: Vec2;
}

export interface SpotElevation {
  position: Vec2;
  elevationFt: number;
}

// Spots sit on the centerline and a lane is drawn a few meters to one side of it, and a run can
// end short of the intersection's spot. Even short NYC blocks are about 60 m long, so this stays
// clear of the next street's spots.
const SPOT_REACH_M = 35;
// Less fall than this is too close to call. Spots are surveyed to about a tenth of a foot, and
// 0.4 ft over a 75 m block is a 0.16% grade, still a real fall for a gravity sewer.
const MIN_FALL_FT = 0.4;
// Fitting a slope from spots along a run needs them spread over enough of it to mean something.
const MIN_SPAN_M = 20;
const MIN_SPAN_SHARE = 0.4;

/** Ground elevations from the city's spot survey, at a point or fitted along a line. */
export interface Ground {
  /** The nearest spot within reach of a point. */
  at: (point: Vec2) => number | null;
  /**
   * Elevations at a line's two ends from a straight fit through every spot within reach of it,
   * for runs whose ends land between spots. Null without enough spots, spread out enough.
   */
  along: (path: Vec2[]) => { startFt: number; endFt: number } | null;
}

/** Spot elevations in a bucket grid, for lookups near a point or along a line. */
export const groundLookup = (spots: SpotElevation[]): Ground => {
  const buckets = new Map<string, SpotElevation[]>();
  const keyOf = (x: number, y: number) => `${x}|${y}`;
  for (const spot of spots) {
    const key = keyOf(
      Math.floor(spot.position[0] / SPOT_REACH_M),
      Math.floor(spot.position[1] / SPOT_REACH_M),
    );
    const bucket = buckets.get(key);
    if (bucket) bucket.push(spot);
    else buckets.set(key, [spot]);
  }
  const cellOf = (value: number) => Math.floor(value / SPOT_REACH_M);

  const at = ([x, y]: Vec2): number | null => {
    const [bx, by] = [cellOf(x), cellOf(y)];
    let best: { elevationFt: number; distance: number } | null = null;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const spot of buckets.get(keyOf(bx + dx, by + dy)) ?? []) {
          const distance = Math.hypot(spot.position[0] - x, spot.position[1] - y);
          if (distance <= SPOT_REACH_M && (!best || distance < best.distance))
            best = { elevationFt: spot.elevationFt, distance };
        }
    return best?.elevationFt ?? null;
  };

  const along = (path: Vec2[]) => {
    const length = polylineLength(path);
    if (length <= 0) return null;
    const xs = path.map((p) => p[0]);
    const ys = path.map((p) => p[1]);
    // Distance along the line and elevation, for each spot beside it.
    const samples: [number, number][] = [];
    for (let bx = cellOf(Math.min(...xs)) - 1; bx <= cellOf(Math.max(...xs)) + 1; bx++)
      for (let by = cellOf(Math.min(...ys)) - 1; by <= cellOf(Math.max(...ys)) + 1; by++)
        for (const spot of buckets.get(keyOf(bx, by)) ?? []) {
          const { distance, fraction } = closestOnPolyline(path, spot.position);
          if (distance <= SPOT_REACH_M) samples.push([fraction * length, spot.elevationFt]);
        }
    if (samples.length < 2) return null;
    const positions = samples.map(([position]) => position);
    const span = Math.max(...positions) - Math.min(...positions);
    if (span < Math.max(MIN_SPAN_M, length * MIN_SPAN_SHARE)) return null;
    // Least squares: elevation = intercept + slope * distance along.
    const meanS = positions.reduce((sum, v) => sum + v, 0) / samples.length;
    const meanZ = samples.reduce((sum, [, z]) => sum + z, 0) / samples.length;
    const covariance = samples.reduce((sum, [v, z]) => sum + (v - meanS) * (z - meanZ), 0);
    const variance = samples.reduce((sum, [v]) => sum + (v - meanS) ** 2, 0);
    const slope = covariance / variance;
    const startFt = meanZ - slope * meanS;
    return { startFt, endFt: startFt + slope * length };
  };

  return { at, along };
};

export const sewerFlow = (path: Vec2[], ground: Ground): SewerFlow | undefined => {
  const [first, last] = [path[0], path.at(-1)];
  if (!first || !last || path.length < 2) return undefined;
  const [atStart, atEnd] = [ground.at(first), ground.at(last)];
  // Spots right at both ends say it best; otherwise fit the ones along the way.
  const fitted = atStart === null || atEnd === null ? ground.along(path) : null;
  const [start, end] = fitted ? [fitted.startFt, fitted.endFt] : [atStart, atEnd];
  if (start === null || end === null || Math.abs(start - end) < MIN_FALL_FT) return undefined;
  const direction = start > end ? 1 : -1;
  const [from, to] = direction === 1 ? [first, last] : [last, first];
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  return {
    direction,
    highFt: Math.max(start, end),
    lowFt: Math.min(start, end),
    downhill: [(to[0] - from[0]) / length, (to[1] - from[1]) / length],
  };
};

const COMPASS = [
  'east',
  'northeast',
  'north',
  'northwest',
  'west',
  'southwest',
  'south',
  'southeast',
];

/** "north", "southwest" and so on, for a direction in local meters (x east, y north). */
export const compassOf = ([x, y]: Vec2) =>
  COMPASS[(Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8]!;
