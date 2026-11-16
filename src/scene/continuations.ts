import type { Feature, Geometry } from 'geojson';
import type { PermitGroupProperties } from '../sources/permits';
import type { StreetSegment } from '../sources/streets';
import { depthStandards, drawnDepthFt } from '../depth';
import { LATERAL_M, type PipeRun } from './build';
import {
  STRAIGHT_WITHIN_M,
  closestOnPolyline,
  linesOf,
  offsetPolyline,
  straighten,
  type LocalFrame,
  type Vec2,
} from './local';

/** A line drawn through a block with no permit for it, because the street has one elsewhere. */
export interface Continuation extends PipeRun {
  assumed: true;
  /** DOT name of the street it continues along. */
  street: string;
}

// A permit block and a street segment are the same block when the segment's middle is this close
// to the permit's centerline. Both come from the city's centerline, so they nearly coincide.
const SAME_BLOCK_M = 8;
// And when they run this nearly parallel, so a cross street through the corner doesn't count.
const MIN_PARALLEL = 0.9;
// A neighbor's lane farther out than this from the street's line belongs to some other street.
const MAX_LANE_M = 12;

const directionOf = (line: Vec2[]): Vec2 => {
  const [a, b] = [line[0]!, line[line.length - 1]!];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
};

const midpointOf = (line: Vec2[]): Vec2 => {
  const [a, b] = [line[0]!, line[line.length - 1]!];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
};

const sameBlock = (segment: Vec2[], centerline: Vec2[]) => {
  if (closestOnPolyline(centerline, midpointOf(segment)).distance > SAME_BLOCK_M) return false;
  const [d, e] = [directionOf(segment), directionOf(centerline)];
  return Math.abs(d[0] * e[0] + d[1] * e[1]) >= MIN_PARALLEL;
};

/**
 * Mains run the length of a street, but permits only show the blocks somebody dug. Where a
 * utility has permits on some blocks of a street, its line is carried through that street's other
 * blocks in the area, marked assumed, so it can be followed end to end. It sits in the lane of the
 * nearest permit block on the same street, so the line doesn't jog where it changes basis.
 */
export const continueAlongStreets = (
  frame: LocalFrame,
  groups: Feature<Geometry, PermitGroupProperties>[],
  runs: PipeRun[],
  streets: StreetSegment[],
): Continuation[] => {
  const centerlines = groups.map((group) =>
    linesOf(group.geometry)
      .map((line) => line.map(frame.toLocal))
      .filter((line) => line.length > 1),
  );
  const segments = streets.flatMap((street) =>
    street.geometry.coordinates
      .map((line) => line.map((p) => frame.toLocal(p)))
      .filter((line) => line.length > 1)
      .map((line) => ({ street: street.permitName, line })),
  );

  const continuations: Continuation[] = [];
  const utilities = new Set(runs.map((run) => run.utility));
  for (const utility of utilities) {
    const standard = depthStandards()[utility];
    const spacing = LATERAL_M[utility];
    if (!standard || spacing === undefined) continue;
    const ownRuns = runs.filter((run) => run.utility === utility && !run.assumed);
    const coveringRuns = (line: Vec2[]) =>
      ownRuns.filter((run) => {
        const index = Number(run.ref.slice('permit-'.length));
        return centerlines[index]?.some((centerline) => sameBlock(line, centerline)) ?? false;
      });

    // The runs drawn on each street, by the blocks they cover.
    const runsOnStreet = new Map<string, PipeRun[]>();
    const covered = segments.map((segment) => {
      const covering = coveringRuns(segment.line);
      if (covering.length)
        runsOnStreet.set(segment.street, [
          ...(runsOnStreet.get(segment.street) ?? []),
          ...covering,
        ]);
      return covering.length > 0;
    });
    segments.forEach((segment, index) => {
      const neighbors = runsOnStreet.get(segment.street);
      if (covered[index] || !neighbors) return;
      continuations.push({
        ref: `assumed-${utility}-${continuations.length}`,
        utility,
        path: offsetPolyline(
          straighten(segment.line, STRAIGHT_WITHIN_M),
          laneNear(segment.line, neighbors) ?? spacing,
        ),
        depthFt: drawnDepthFt(standard),
        digSpots: 0,
        assumed: true,
        street: segment.street,
      });
    });
  }
  return continuations;
};

/**
 * The lane of the nearest run on the same street, as a sideways offset from this segment's own
 * line (positive to the right of travel, like `offsetPolyline`), or null if none is in line.
 */
const laneNear = (line: Vec2[], runs: PipeRun[]): number | null => {
  const [a] = line;
  const middle = midpointOf(line);
  const [dx, dy] = directionOf(line);
  let best: { offset: number; distance: number } | null = null;
  for (const run of runs) {
    const { point, distance } = closestOnPolyline(run.path, middle);
    const offset = (point[0] - a![0]) * dy - (point[1] - a![1]) * dx;
    // Where the street bends, the next block's lane can land well off this one's line.
    if (Math.abs(offset) <= MAX_LANE_M && (!best || distance < best.distance))
      best = { offset, distance };
  }
  return best?.offset ?? null;
};

/** A short assumed piece joining a line's end to where same-utility lines meet at a corner. */
export interface Junction extends PipeRun {
  assumed: true;
  /** How many line ends meet here. */
  meeting: number;
}

// Street ends this close together are one corner.
const SAME_CORNER_M = 3;
// A line end this close to a corner ends there; the lanes sit up to about 7 m off the centerline.
const CORNER_REACH_M = 12;
// Ends already this close to the meeting point need no piece.
const TOUCHING_M = 0.2;

/** Corners: where two or more street segments meet, from the ends of the city's centerline. */
const cornersOf = (frame: LocalFrame, streets: StreetSegment[]): Vec2[] => {
  const ends = streets.flatMap((street) =>
    street.geometry.coordinates
      .filter((line) => line.length > 1)
      .flatMap((line) => [frame.toLocal(line[0]!), frame.toLocal(line[line.length - 1]!)]),
  );
  const corners: { point: Vec2; count: number }[] = [];
  for (const end of ends) {
    const near = corners.find(
      (c) => Math.hypot(c.point[0] - end[0], c.point[1] - end[1]) <= SAME_CORNER_M,
    );
    if (near) near.count += 1;
    else corners.push({ point: end, count: 1 });
  }
  return corners.filter((c) => c.count >= 2).map((c) => c.point);
};

// Lines within this angle of each other run the same way through a corner.
const SAME_WAY_COS = Math.cos((25 * Math.PI) / 180);

interface Lane {
  point: Vec2;
  direction: Vec2;
}

/** Where two lanes cross, if they aren't parallel. */
const crossing = (a: Lane, b: Lane): Vec2 | null => {
  const denominator = a.direction[0] * b.direction[1] - a.direction[1] * b.direction[0];
  if (Math.abs(denominator) < 1e-6) return null;
  const [ox, oy] = [b.point[0] - a.point[0], b.point[1] - a.point[1]];
  const t = (ox * b.direction[1] - oy * b.direction[0]) / denominator;
  return [a.point[0] + a.direction[0] * t, a.point[1] + a.direction[1] * t];
};

const unit = (from: Vec2, to: Vec2): Vec2 => {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  return [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
};

/**
 * Mains meet at corners, but each block's line stops at the corner in its own lane. At every
 * corner, each utility's line ends are carried on along their lane to where it crosses the other
 * street's lane of that utility, so lines meet where they would cross. Lines on the same street
 * whose lanes don't line up get a short jog between them. Nobody publishes how mains connect, so
 * the joins are assumed.
 */
export const joinAtCorners = (
  frame: LocalFrame,
  runs: PipeRun[],
  streets: StreetSegment[],
): Junction[] => {
  const junctions: Junction[] = [];
  const join = (
    utility: PipeRun['utility'],
    from: Vec2,
    to: Vec2,
    depthFt: number,
    meeting: number,
  ) => {
    if (Math.hypot(to[0] - from[0], to[1] - from[1]) <= TOUCHING_M) return;
    junctions.push({
      ref: `junction-${utility}-${junctions.length}`,
      utility,
      path: [from, to],
      depthFt,
      digSpots: 0,
      assumed: true,
      meeting,
    });
  };

  for (const corner of cornersOf(frame, streets)) {
    const near = (p: Vec2) => Math.hypot(p[0] - corner[0], p[1] - corner[1]) <= CORNER_REACH_M;
    const utilities = new Set(runs.map((run) => run.utility));
    for (const utility of utilities) {
      const own = runs.filter((run) => run.utility === utility && run.path.length > 1);
      // Line ends at this corner, each with the way its lane runs. Twin groups and a recorded
      // block meeting an assumed one can end at the same spot; those count once.
      const ends: { end: Vec2; direction: Vec2; depthFt: number }[] = [];
      for (const run of own) {
        const last = run.path.length - 1;
        for (const [end, previous] of [
          [run.path[0]!, run.path[1]!],
          [run.path[last]!, run.path[last - 1]!],
        ] as const) {
          if (!near(end)) continue;
          if (ends.some((e) => Math.hypot(e.end[0] - end[0], e.end[1] - end[1]) <= TOUCHING_M))
            continue;
          ends.push({ end, direction: unit(previous, end), depthFt: run.depthFt });
        }
      }
      // Lines running straight through the corner, which side streets can join onto.
      const through: Lane[] = own.flatMap((run) => {
        const { point, fraction } = closestOnPolyline(run.path, corner);
        if (fraction <= 0 || fraction >= 1 || !near(point)) return [];
        return [{ point, direction: unit(run.path[0]!, run.path[run.path.length - 1]!) }];
      });
      if (ends.length + through.length < 2) continue;

      // One lane per way through the corner.
      const lanes: (Lane & { ends: typeof ends })[] = [];
      const laneFor = (direction: Vec2) =>
        lanes.find(
          (lane) =>
            Math.abs(lane.direction[0] * direction[0] + lane.direction[1] * direction[1]) >=
            SAME_WAY_COS,
        );
      for (const lane of through) if (!laneFor(lane.direction)) lanes.push({ ...lane, ends: [] });
      for (const end of ends) {
        const lane = laneFor(end.direction);
        if (lane) lane.ends.push(end);
        else lanes.push({ point: end.end, direction: end.direction, ends: [end] });
      }

      const meeting = ends.length + through.length;
      for (const lane of lanes) {
        const other = lanes.find((l) => l !== lane);
        const meet = other ? crossing(lane, other) : null;
        if (meet && near(meet)) {
          // Carry each end along its lane to the crossing.
          for (const { end, depthFt } of lane.ends) join(utility, end, meet, depthFt, meeting);
          continue;
        }
        // A single way through: ends on the same street, joined straight across any shift.
        const [first, ...rest] = lane.ends;
        for (const end of rest)
          if (first) join(utility, first.end, end.end, first.depthFt, meeting);
      }
    }
  }
  return junctions;
};
