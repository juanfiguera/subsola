import type { Vec2 } from './local';

// Close enough to be the address's own grid, wide enough that one diagonal avenue doesn't decide.
const GRID_RADIUS_M = 150;
// How strongly the streets nearby must agree before the map turns; 1 is a perfect grid.
const MIN_AGREEMENT = 0.5;

/**
 * The map bearing that runs the street grid around a point straight up and across, in degrees
 * clockwise from north, between -45 and 45. Streets a quarter turn apart are the same grid, so
 * each segment's direction is taken four times over before averaging, weighted by length.
 * Returns 0 (north up) where the streets don't form a clear grid.
 */
export const gridBearing = (paths: Vec2[][], around: Vec2): number => {
  let [cosSum, sinSum, total] = [0, 0, 0];
  for (const path of paths)
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1]!, path[i]!];
      const middle: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (Math.hypot(middle[0] - around[0], middle[1] - around[1]) > GRID_RADIUS_M) continue;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // Clockwise from north (+y), like a compass.
      const angle = Math.atan2(b[0] - a[0], b[1] - a[1]) * 4;
      cosSum += Math.cos(angle) * length;
      sinSum += Math.sin(angle) * length;
      total += length;
    }
  if (!total || Math.hypot(cosSum, sinSum) / total < MIN_AGREEMENT) return 0;
  return (Math.atan2(sinSum, cosSum) / 4) * (180 / Math.PI);
};
