/** [west, south, east, north] */
export type Box = [number, number, number, number];
type Point = number[];

const inside = (point: Point, edge: number, box: Box) =>
  edge === 0
    ? point[0]! >= box[0]
    : edge === 1
      ? point[1]! >= box[1]
      : edge === 2
        ? point[0]! <= box[2]
        : point[1]! <= box[3];

const crossing = (a: Point, b: Point, edge: number, box: Box): Point => {
  const vertical = edge === 0 || edge === 2;
  const at = box[edge]!;
  const t = vertical ? (at - a[0]!) / (b[0]! - a[0]!) : (at - a[1]!) / (b[1]! - a[1]!);
  return vertical ? [at, a[1]! + t * (b[1]! - a[1]!)] : [a[0]! + t * (b[0]! - a[0]!), at];
};

/**
 * Sutherland-Hodgman against each side of the box. The result can run along the box edge where
 * the ring left and came back, which is harmless for a filled shape. Closed like GeoJSON, or
 * empty when nothing is left.
 */
export const clipRing = (ring: Point[], box: Box): Point[] => {
  let points = ring.slice(0, -1);
  for (let edge = 0; edge < 4 && points.length; edge++) {
    const next: Point[] = [];
    for (let i = 0; i < points.length; i++) {
      const current = points[i]!;
      const previous = points[(i + points.length - 1) % points.length]!;
      const currentIn = inside(current, edge, box);
      if (currentIn !== inside(previous, edge, box))
        next.push(crossing(previous, current, edge, box));
      if (currentIn) next.push(current);
    }
    points = next;
  }
  return points.length >= 3 ? [...points, points[0]!] : [];
};

/** A polygon cut to the box: holes kept, and nothing at all once the outer ring is gone. */
export const clipPolygon = (polygon: Point[][], box: Box): Point[][] => {
  const [outer, ...holes] = polygon.map((ring) => clipRing(ring, box));
  if (!outer?.length) return [];
  return [outer, ...holes.filter((ring) => ring.length)];
};

/** Liang-Barsky on each segment, joining the pieces that stay inside into runs. */
export const clipLine = (line: Point[], box: Box): Point[][] => {
  const runs: Point[][] = [];
  let run: Point[] = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const dx = b[0]! - a[0]!;
    const dy = b[1]! - a[1]!;
    let t0 = 0;
    let t1 = 1;
    const sides: [number, number][] = [
      [-dx, a[0]! - box[0]],
      [dx, box[2] - a[0]!],
      [-dy, a[1]! - box[1]],
      [dy, box[3] - a[1]!],
    ];
    let visible = true;
    for (const [p, q] of sides) {
      if (p === 0) {
        if (q < 0) visible = false;
        continue;
      }
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
    if (!visible || t0 > t1) {
      if (run.length >= 2) runs.push(run);
      run = [];
      continue;
    }
    const start = t0 === 0 ? a : [a[0]! + t0 * dx, a[1]! + t0 * dy];
    const end = t1 === 1 ? b : [a[0]! + t1 * dx, a[1]! + t1 * dy];
    if (!run.length) run.push(start);
    run.push(end);
    // Leaving the box ends this run; the line may come back in later.
    if (t1 < 1) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length >= 2) runs.push(run);
  return runs;
};
