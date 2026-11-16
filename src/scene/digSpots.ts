import {
  matchesStreet,
  parseLocationNote,
  type Compass,
  type CurbOffset,
} from '../sources/locationNotes';
import type { UtilityKind } from '../utilities';
import { closestOnPolyline, pointAlong, type Vec2 } from './local';

/** Where a crew's location note puts their opening, measured from two curbs. */
export interface DigSpot {
  ref: string;
  /** The permit group the dig belongs to, for its card. */
  permitRef: string;
  utility: UtilityKind;
  position: Vec2;
  note: string;
  permitNumber: string;
  issued: string | undefined;
}

export interface NamedStreet {
  permitName: string;
  paths: Vec2[][];
}

const FEET_TO_METERS = 0.3048;
const COMPASS: Record<Compass, Vec2> = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] };
// A curb named for a direction the street runs along ("north curb" of a north-south street) is
// ambiguous, so the street's side has to face that way at least this squarely.
const MIN_FACING = 0.4;
// Half a roadbed is rarely past this; beyond it the ray found some other street's curb.
const MAX_HALF_WIDTH_M = 20;
// Two offsets along nearly parallel streets don't pin a point.
const MIN_CROSSING = 0.3;
// A spot farther than this from its own permit's block came from a misread street name.
export const MAX_FROM_BLOCK_M = 40;
// Meters along the street from the corner, both ways, to read the curb's distance.
const CURB_SAMPLES_M = [-25, -18, 18, 25];

const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];

/** Distance along a ray to the first curb it meets. */
const rayToCurb = (origin: Vec2, direction: Vec2, curbs: Vec2[][]): number | null => {
  let best: number | null = null;
  for (const curb of curbs) {
    for (let i = 1; i < curb.length; i++) {
      const [a, b] = [curb[i - 1]!, curb[i]!];
      const segment: Vec2 = [b[0] - a[0], b[1] - a[1]];
      const denominator = direction[0] * segment[1] - direction[1] * segment[0];
      if (!denominator) continue;
      const offset: Vec2 = [a[0] - origin[0], a[1] - origin[1]];
      const t = (offset[0] * segment[1] - offset[1] * segment[0]) / denominator;
      const u = (offset[0] * direction[1] - offset[1] * direction[0]) / denominator;
      if (t > 0.5 && t <= MAX_HALF_WIDTH_M && u >= 0 && u <= 1 && (best === null || t < best)) {
        best = t;
      }
    }
  }
  return best;
};

/** The nearest point on a street to a spot, and the street's direction there. */
const nearestOn = (street: NamedStreet, spot: Vec2) => {
  let best: { point: Vec2; along: Vec2; distance: number } | null = null;
  for (const path of street.paths) {
    if (path.length < 2) continue;
    const { point, distance, fraction } = closestOnPolyline(path, spot);
    if (best && distance >= best.distance) continue;
    const [a, b] = [
      pointAlong(path, Math.max(0, fraction - 0.02)),
      pointAlong(path, Math.min(1, fraction + 0.02)),
    ];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    best = { point, along: [(b[0] - a[0]) / length, (b[1] - a[1]) / length], distance };
  }
  return best;
};

/** Where two streets meet, or come closest. */
const meeting = (a: NamedStreet, b: NamedStreet): Vec2 | null => {
  let best: { point: Vec2; distance: number } | null = null;
  for (const path of a.paths) {
    for (const vertex of path) {
      const near = nearestOn(b, vertex);
      if (near && (!best || near.distance < best.distance))
        best = { point: vertex, distance: near.distance };
    }
  }
  return best?.point ?? null;
};

/** The line `normal · p = value` the offset puts the dig on: parallel to its street. */
const offsetLine = (
  offset: CurbOffset,
  street: NamedStreet,
  near: Vec2,
  curbs: Vec2[][],
): { normal: Vec2; value: number } | null => {
  const on = nearestOn(street, near);
  if (!on) return null;
  const compass = COMPASS[offset.curb];
  const side: Vec2 = [-on.along[1], on.along[0]];
  const facing = dot(side, compass);
  if (Math.abs(facing) < MIN_FACING) return null;
  const normal: Vec2 = facing > 0 ? side : [-side[0], -side[1]];
  const nearby = curbsNear(curbs, on.point);
  // At the corner itself a ray runs down the cross street, so the curb is measured a little way
  // into the block on both sides and the middle reading kept.
  const readings = CURB_SAMPLES_M.flatMap((shift) => {
    const from: Vec2 = [on.point[0] + on.along[0] * shift, on.point[1] + on.along[1] * shift];
    const reading = rayToCurb(from, normal, nearby);
    return reading === null ? [] : [reading];
  }).sort((x, y) => x - y);
  const halfWidth = readings.length ? readings[Math.floor(readings.length / 2)]! : null;
  if (halfWidth === null) return null;
  // "W of the E curb" runs back into the street; "N of the N curb" runs out past it.
  const outward = dot(COMPASS[offset.toward], normal) > 0 ? 1 : -1;
  return {
    normal,
    value: dot(normal, on.point) + halfWidth + outward * offset.feet * FEET_TO_METERS,
  };
};

// Curb rays start up to 25 m along the street from where they're measured and reach 20 m;
// nothing farther can be hit.
const CURB_REACH_M = Math.max(...CURB_SAMPLES_M.map(Math.abs)) + MAX_HALF_WIDTH_M + 5;

/**
 * Curbs whose bounding box reaches around a point, so each ray tests a few dozen
 * segments instead of every curb loaded. A box, not the vertices, since one straight segment can
 * run past the point with both ends far away.
 */
const curbsNear = (curbs: Vec2[][], center: Vec2) =>
  curbs.filter((curb) => {
    let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of curb) {
      west = Math.min(west, x);
      east = Math.max(east, x);
      south = Math.min(south, y);
      north = Math.max(north, y);
    }
    return (
      west <= center[0] + CURB_REACH_M &&
      east >= center[0] - CURB_REACH_M &&
      south <= center[1] + CURB_REACH_M &&
      north >= center[1] - CURB_REACH_M
    );
  });

/** The point a two-offset note describes, or null when it can't be pinned down. */
export const resolveDigSpot = (
  offsets: CurbOffset[],
  streets: NamedStreet[],
  curbs: Vec2[][],
): Vec2 | null => {
  if (offsets.length < 2) return null;
  const [first, second] = offsets as [CurbOffset, CurbOffset];
  const find = (offset: CurbOffset) =>
    streets.find((s) => matchesStreet(offset.street, s.permitName));
  const [streetA, streetB] = [find(first), find(second)];
  if (!streetA || !streetB || streetA === streetB) return null;
  const corner = meeting(streetA, streetB);
  if (!corner) return null;
  const lineA = offsetLine(first, streetA, corner, curbs);
  const lineB = offsetLine(second, streetB, corner, curbs);
  if (!lineA || !lineB) return null;
  const determinant = lineA.normal[0] * lineB.normal[1] - lineA.normal[1] * lineB.normal[0];
  if (Math.abs(determinant) < MIN_CROSSING) return null;
  return [
    (lineA.value * lineB.normal[1] - lineB.value * lineA.normal[1]) / determinant,
    (lineA.normal[0] * lineB.value - lineB.normal[0] * lineA.value) / determinant,
  ];
};

export interface NotedPermit {
  utility: UtilityKind;
  locationNote: string | undefined;
  permitNumber: string;
  issued?: string;
  /** A manhole or sidewalk permit; its note doesn't mark an excavation. */
  noOpening?: true;
}

/**
 * Every crew note near the address that pins down a spot. A permit's notes repeat across its
 * renewals, so each spot is kept once.
 */
export const buildDigSpots = (
  groups: { ref: string; permits: NotedPermit[]; paths: Vec2[][] }[],
  streets: NamedStreet[],
  curbs: Vec2[][],
): DigSpot[] => {
  const seen = new Set<string>();
  const spots: DigSpot[] = [];
  // Renewals repeat a permit's note word for word, and the spot depends only on the note.
  const resolved = new Map<string, Vec2 | null>();
  const resolve = (note: string) => {
    if (!resolved.has(note))
      resolved.set(note, resolveDigSpot(parseLocationNote(note), streets, curbs));
    return resolved.get(note)!;
  };
  for (const group of groups) {
    for (const permit of group.permits) {
      if (!permit.locationNote || permit.noOpening) continue;
      const position = resolve(permit.locationNote);
      if (!position) continue;
      const fromBlock = Math.min(
        ...group.paths
          .filter((p) => p.length > 1)
          .map((p) => closestOnPolyline(p, position).distance),
      );
      if (!(fromBlock <= MAX_FROM_BLOCK_M)) continue;
      const key = `${permit.utility}|${Math.round(position[0] * 2)}|${Math.round(position[1] * 2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      spots.push({
        ref: `dig-${spots.length}`,
        permitRef: group.ref,
        utility: permit.utility,
        position,
        note: permit.locationNote,
        permitNumber: permit.permitNumber,
        issued: permit.issued,
      });
    }
  }
  return spots;
};
