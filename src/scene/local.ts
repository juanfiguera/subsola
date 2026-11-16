import type { Geometry, Position } from 'geojson';

/**
 * The 3D scene is a flat world in meters around the address: x east, y north, z up.
 * At a 500 ft radius the error versus true geodesic distance is under a centimeter.
 */
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

const EARTH_RADIUS_M = 6_371_008;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export interface LocalFrame {
  origin: Position;
  toLocal: (lngLat: Position) => Vec2;
  toLngLat: (local: Vec2) => Position;
}

export const createFrame = (origin: Position): LocalFrame => {
  const [lng0, lat0] = origin as [number, number];
  const metersPerDegLat = (Math.PI * EARTH_RADIUS_M) / 180;
  const metersPerDegLng = metersPerDegLat * Math.cos(toRad(lat0));
  return {
    origin,
    toLocal: ([lng, lat]) => [(lng! - lng0) * metersPerDegLng, (lat! - lat0) * metersPerDegLat],
    toLngLat: ([x, y]) => [lng0 + x / metersPerDegLng, lat0 + y / metersPerDegLat],
  };
};

export const linesOf = (geometry: Geometry): Position[][] =>
  geometry.type === 'LineString'
    ? [geometry.coordinates]
    : geometry.type === 'MultiLineString'
      ? geometry.coordinates
      : [];

export const pointsOf = (geometry: Geometry): Position[] =>
  geometry.type === 'Point'
    ? [geometry.coordinates]
    : geometry.type === 'MultiPoint'
      ? geometry.coordinates
      : [];

export const ringsOf = (geometry: Geometry): Position[][][] =>
  geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : [];

export const distance2 = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Shifts a polyline sideways by `meters` (positive = right of travel direction). */
export const offsetPolyline = (line: Vec2[], meters: number): Vec2[] => {
  if (meters === 0 || line.length < 2) return line;
  return line.map((point, i) => {
    const prev = line[Math.max(0, i - 1)]!;
    const next = line[Math.min(line.length - 1, i + 1)]!;
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const length = Math.hypot(dx, dy) || 1;
    return [point[0] + (dy / length) * meters, point[1] - (dx / length) * meters];
  });
};

// Well inside a pipe's width, so a run never leaves where it was drawn by more than that.
export const STRAIGHT_WITHIN_M = 0.3;

/**
 * Drops the points that don't change a line's course by more than `toleranceM` (Douglas-Peucker).
 * Some cities' street lines carry a point every few meters along a straight block, and every
 * point on a pipe run gets a coupling, so a straight main came out ribbed.
 */
export const straighten = (line: Vec2[], toleranceM: number): Vec2[] => {
  if (line.length < 3) return line;
  const first = line[0]!;
  const last = line[line.length - 1]!;
  const length = distance2(first, last);
  let farthest = 0;
  let farthestAt = 0;
  for (let i = 1; i < line.length - 1; i++) {
    const p = line[i]!;
    const off = length
      ? Math.abs(
          (last[0] - first[0]) * (first[1] - p[1]) - (first[0] - p[0]) * (last[1] - first[1]),
        ) / length
      : distance2(first, p);
    if (off > farthest) [farthest, farthestAt] = [off, i];
  }
  if (farthest <= toleranceM) return [first, last];
  return [
    ...straighten(line.slice(0, farthestAt + 1), toleranceM).slice(0, -1),
    ...straighten(line.slice(farthestAt), toleranceM),
  ];
};

/** Splits a polyline into pieces no longer than `step` meters, so the lens can light it piece by piece. */
export const densify = (line: Vec2[], step: number): Vec2[] => {
  const out: Vec2[] = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const pieces = Math.max(1, Math.ceil(distance2(a, b) / step));
    for (let k = 0; k < pieces; k++) {
      const t = k / pieces;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  const last = line[line.length - 1];
  if (last) out.push(last);
  return out;
};

/** Angle of a polyline's overall direction in degrees, counterclockwise from east. */
export const headingDegrees = (line: Vec2[]) => {
  const a = line[0]!;
  const b = line[line.length - 1]!;
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
};

/** Point at fraction `t` (0 to 1) of a polyline's length. */
export const pointAlong = (line: Vec2[], t: number): Vec2 => {
  const lengths = line.slice(1).map((p, i) => distance2(line[i]!, p));
  let remaining = lengths.reduce((sum, l) => sum + l, 0) * Math.min(1, Math.max(0, t));
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!;
    if (remaining <= length) {
      const f = length ? remaining / length : 0;
      const a = line[i]!;
      const b = line[i + 1]!;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    remaining -= length;
  }
  return line[line.length - 1] ?? [0, 0];
};

export const midpoint = (line: Vec2[]): Vec2 => pointAlong(line, 0.5);

export const polylineLength = (line: Vec2[]) =>
  line.slice(1).reduce((sum, p, i) => sum + distance2(line[i]!, p), 0);

/** The point on a polyline closest to `point`, how far away it is, and how far along the line (0 to 1). */
export const closestOnPolyline = (line: Vec2[], point: Vec2) => {
  const total = polylineLength(line);
  let best = { distance: Infinity, along: 0, closest: line[0] ?? point };
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const length = distance2(a, b);
    const projected = length
      ? ((point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])) / length ** 2
      : 0;
    const t = Math.min(1, Math.max(0, projected));
    const closest: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const distance = distance2(closest, point);
    if (distance < best.distance) best = { distance, along: walked + t * length, closest };
    walked += length;
  }
  if (line.length === 1) best = { ...best, distance: distance2(line[0]!, point) };
  return { point: best.closest, distance: best.distance, fraction: total ? best.along / total : 0 };
};

/** Fraction (0 to 1) along a polyline of its point closest to `point`. */
export const nearestFraction = (line: Vec2[], point: Vec2) =>
  closestOnPolyline(line, point).fraction;

/**
 * How far `point` sits to the side of a polyline, with the same sign as `offsetPolyline`
 * (positive = right of travel), or null when its nearest point is an end of the line.
 */
export const sideOffset = (line: Vec2[], point: Vec2): number | null => {
  const { point: closest, fraction } = closestOnPolyline(line, point);
  if (line.length < 2 || fraction <= 0 || fraction >= 1) return null;
  const [a, b] = [
    pointAlong(line, Math.max(0, fraction - 0.01)),
    pointAlong(line, Math.min(1, fraction + 0.01)),
  ];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const right: Vec2 = [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
  return (point[0] - closest[0]) * right[0] + (point[1] - closest[1]) * right[1];
};
