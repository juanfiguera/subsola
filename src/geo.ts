import type { Geometry, Position } from 'geojson';

const EARTH_RADIUS_M = 6_371_008;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Local equirectangular projection; accurate to centimeters over a few hundred meters. */
const toLocalMeters = (origin: Position, point: Position): [number, number] => [
  toRad(point[0]! - origin[0]!) * EARTH_RADIUS_M * Math.cos(toRad(origin[1]!)),
  toRad(point[1]! - origin[1]!) * EARTH_RADIUS_M,
];

const distanceToSegment = (origin: Position, a: Position, b: Position): number => {
  const [ax, ay] = toLocalMeters(origin, a);
  const [bx, by] = toLocalMeters(origin, b);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
  return Math.hypot(ax + t * dx, ay + t * dy);
};

export const distanceMeters = (origin: Position, geometry: Geometry): number => {
  switch (geometry.type) {
    case 'Point':
      return Math.hypot(...toLocalMeters(origin, geometry.coordinates));
    case 'MultiPoint':
      return Math.min(...geometry.coordinates.map((p) => Math.hypot(...toLocalMeters(origin, p))));
    case 'LineString':
      return lineDistance(origin, geometry.coordinates);
    case 'MultiLineString':
      return Math.min(...geometry.coordinates.map((line) => lineDistance(origin, line)));
    default:
      return Infinity;
  }
};

const lineDistance = (origin: Position, line: Position[]): number =>
  Math.min(...line.slice(1).map((point, i) => distanceToSegment(origin, line[i]!, point)));

export const feetFromMeters = (meters: number) => meters * 3.28084;

/** Even-odd ray test against one ring. */
const inRing = ([x, y]: number[], ring: number[][]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > y! !== yj! > y! && x! < ((xj! - xi!) * (y! - yi!)) / (yj! - yi!) + xi!)
      inside = !inside;
  }
  return inside;
};

/** Inside the outer ring and outside every hole. */
export const inPolygon = (point: number[], [outer, ...holes]: number[][][]) =>
  !!outer && inRing(point, outer) && !holes.some((hole) => inRing(point, hole));
