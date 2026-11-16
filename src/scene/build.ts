import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { PermitGroupProperties } from '../sources/permits';
import type { AssetFeature, AssetKind } from '../sources/assets';
import type { SewerFlow } from './slope';
import type { StreetSegment } from '../sources/streets';
import { depthStandards, drawnDepthFt } from '../depth';
import type { UtilityKind } from '../utilities';
import { isRecycled, type SurveyedMain } from '../sources/mains';
import { streetName } from '../ui/dom';
import type { ServiceLine } from './services';
import type { DigSpot } from './digSpots';
import {
  closestOnPolyline,
  densify,
  headingDegrees,
  linesOf,
  midpoint,
  offsetPolyline,
  pointsOf,
  ringsOf,
  sideOffset,
  straighten,
  STRAIGHT_WITHIN_M,
  type LocalFrame,
  type Vec2,
} from './local';

/**
 * Utilities sit side by side so they never hide each other. Real horizontal positions are
 * not public; this spacing only keeps them legible and is stated in the UI. Blocks where crews
 * wrote down where they dug use those notes instead (see `lanesFromDigSpots`).
 */
export const LATERAL_M: Partial<Record<UtilityKind, number>> = {
  electric: -4.5,
  gas: -3,
  telecom: -1.5,
  water: 1.5,
  sewer: 3,
  steam: 4.5,
};

// A note farther than this from the centerline is a service dig at the curb or past it, not
// the main.
const MAX_LANE_FROM_CENTER_M = 12;
// One note is an anecdote; the middle of two or more is a lane.
const MIN_DIG_SPOTS = 2;
// Centers this far apart keep the thickest drawn pipes (sewer beside water) from touching.
const LANE_GAP_M = 1.2;

// Short enough that the x-ray lens edge looks round as it sweeps along a pipe.
const PIECE_M = 2;

export interface PipePiece {
  ref: string;
  utility: UtilityKind;
  a: Vec2;
  b: Vec2;
  depthFt: number;
  /** Carried through a block with no permit for it; see `continueAlongStreets`. */
  assumed?: boolean;
  /** Sewers only: 1 if it drains from a to b, -1 from b to a; see `sewerFlow`. */
  flow?: 1 | -1;
  radiusM?: number;
  /** San Diego's purple pipe, drawn in its own color. */
  recycled?: true;
}

export interface PipeRun {
  ref: string;
  utility: UtilityKind;
  path: Vec2[];
  depthFt: number;
  /** How many crew dig notes placed this lane; 0 means it sits at the default spacing. */
  digSpots: number;
  /** Carried through a block with no permit for it; see `continueAlongStreets`. */
  assumed?: boolean;
  flow?: SewerFlow;
  /** On its surveyed route, from the utility's own map; see `buildSurveyedMains`. */
  surveyed?: SurveyedMain;
  radiusM?: number;
}

/** A run cut into short pieces, so the x-ray lens and selection can light it piece by piece. */
export const piecesOf = (run: PipeRun): PipePiece[] => {
  const dense = densify(run.path, PIECE_M);
  return dense.slice(1).map((b, i) => ({
    ref: run.ref,
    utility: run.utility,
    a: dense[i]!,
    b,
    depthFt: run.depthFt,
    ...(run.assumed ? { assumed: true } : {}),
    ...(run.flow ? { flow: run.flow.direction } : {}),
    ...(run.radiusM ? { radiusM: run.radiusM } : {}),
    ...(isRecycled(run.surveyed) ? { recycled: true as const } : {}),
  }));
};

/** A block's lane moved to the middle of the digs crews noted on it. */
export interface LanePlacement {
  lateralM: number;
  digSpots: number;
}

export interface ScenePoint {
  ref: string;
  kind: AssetKind | 'permit-point';
  utility: UtilityKind | null;
  position: Vec2;
  depthFt?: number;
  /** A catch basin in a separate storm sewer area, which doesn't drain to the drawn sewer. */
  stormSewer?: true;
  /**
   * A catch basin that drains only to a mapped storm drain, never a sanitary sewer, or a storm
   * drain's own maintenance hole.
   */
  stormOnly?: true;
}

export interface SceneBuilding {
  polygon: Vec2[][];
  heightM: number;
}

export interface StreetLabel {
  text: string;
  position: Vec2;
  angle: number;
  /** Every centerline piece of the street, so a tag can sit wherever the camera is looking. */
  paths: Vec2[][];
}

export interface SceneData {
  runs: PipeRun[];
  pieces: PipePiece[];
  points: ScenePoint[];
  services: ServiceLine[];
  digSpots: DigSpot[];
  roads: Vec2[][][];
  sidewalks: Vec2[][][];
  curbs: Vec2[][];
  buildings: SceneBuilding[];
  labels: StreetLabel[];
}

export const emptyScene = (): SceneData => ({
  runs: [],
  pieces: [],
  points: [],
  services: [],
  digSpots: [],
  roads: [],
  sidewalks: [],
  curbs: [],
  buildings: [],
  labels: [],
});

export const buildPipes = (
  frame: LocalFrame,
  groups: Feature<Geometry, PermitGroupProperties>[],
  lanes: Map<string, LanePlacement> = new Map(),
): Pick<SceneData, 'runs' | 'pieces' | 'points'> => {
  const runs: PipeRun[] = [];
  const pieces: PipePiece[] = [];
  const points: ScenePoint[] = [];

  groups.forEach((group, index) => {
    const utility = group.properties.utility;
    const spacing = LATERAL_M[utility];
    const standard = depthStandards()[utility];
    // City reconstruction contracts are not a pipe; they stay in the story cards only.
    if (spacing === undefined || !standard) return;
    const ref = `permit-${index}`;
    const depthFt = drawnDepthFt(standard);
    const placed = lanes.get(ref);

    for (const line of linesOf(group.geometry)) {
      const path = offsetPolyline(
        straighten(line.map(frame.toLocal), STRAIGHT_WITHIN_M),
        placed?.lateralM ?? spacing,
      );
      const run = { ref, utility, path, depthFt, digSpots: placed?.digSpots ?? 0 };
      runs.push(run);
      pieces.push(...piecesOf(run));
    }
    for (const point of pointsOf(group.geometry)) {
      points.push({ ref, kind: 'permit-point', utility, position: frame.toLocal(point), depthFt });
    }
  });
  return { runs, pieces, points };
};

// A water main's drawn radius at 12 in. Bigger mains grow with the square root of their size,
// so a 78 in transmission main reads as big without swallowing the street.
const MAIN_RADIUS_AT_12_IN_M = 0.4;
// A house sewer of no recorded size (Los Angeles's) is drawn as thin as the house sewers drawn
// from permits, not as a main.
const SIDE_SEWER_RADIUS_M = 0.18;

/** The utility's own surveyed mains, each on its true route at the standard depth. */
export const buildSurveyedMains = (frame: LocalFrame, mains: SurveyedMain[]): PipeRun[] =>
  mains.flatMap((main, index) => {
    const standard = depthStandards()[main.utility];
    if (!standard && main.depthFt === null) return [];
    return main.line.coordinates.map((line) => ({
      ref: `main-${index}`,
      utility: main.utility,
      path: straighten(line.map(frame.toLocal), STRAIGHT_WITHIN_M),
      // Where the records give its depth, it's drawn there. A building's own sewer leaves the
      // building shallower than the mains run.
      depthFt:
        main.depthFt ?? (main.use === 'side' ? standard!.shallowestFt : drawnDepthFt(standard!)),
      digSpots: 0,
      surveyed: main,
      ...(main.diameterIn
        ? { radiusM: MAIN_RADIUS_AT_12_IN_M * Math.sqrt(main.diameterIn / 12) }
        : main.use === 'side'
          ? { radiusM: SIDE_SEWER_RADIUS_M }
          : {}),
    }));
  });

/** The lanes on one block, with offsets turned to share the block's direction of travel. */
const blockOf = (path: Vec2[]): { key: string; sign: 1 | -1 } => {
  const [start, end] = [path[0]!, path[path.length - 1]!].map(
    (p) => `${Math.round(p[0] / 2)},${Math.round(p[1] / 2)}`,
  ) as [string, string];
  return start < end ? { key: `${start}|${end}`, sign: 1 } : { key: `${end}|${start}`, sign: -1 };
};

/**
 * Where crews' notes put each block's lane: the median of their digs' distance from the block
 * centerline. A dig marks a corner of the opening rather than the pipe itself, and some are
 * service taps, so it takes two notes to move a lane. Lanes on one block stay apart; when two
 * would touch, the one with fewer notes behind it moves.
 */
export const lanesFromDigSpots = (
  frame: LocalFrame,
  groups: Feature<Geometry, PermitGroupProperties>[],
  spots: DigSpot[],
): Map<string, LanePlacement> => {
  const centerlinesOf = (group: Feature<Geometry, PermitGroupProperties>) =>
    linesOf(group.geometry)
      .map((line) => line.map(frame.toLocal))
      .filter((line) => line.length > 1);

  const offsetsByRef = new Map<string, number[]>();
  for (const spot of spots) {
    const group = groups[Number(spot.permitRef.slice('permit-'.length))];
    if (!group) continue;
    const nearest = centerlinesOf(group).reduce<Vec2[] | null>(
      (best, line) =>
        !best ||
        closestOnPolyline(line, spot.position).distance <
          closestOnPolyline(best, spot.position).distance
          ? line
          : best,
      null,
    );
    const offset = nearest ? sideOffset(nearest, spot.position) : null;
    if (offset === null || Math.abs(offset) > MAX_LANE_FROM_CENTER_M) continue;
    offsetsByRef.set(spot.permitRef, [...(offsetsByRef.get(spot.permitRef) ?? []), offset]);
  }

  const placed = new Map<string, LanePlacement>();
  for (const [ref, offsets] of offsetsByRef) {
    if (offsets.length < MIN_DIG_SPOTS) continue;
    const sorted = [...offsets].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const lateralM =
      sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
    placed.set(ref, { lateralM, digSpots: sorted.length });
  }

  // A block can carry several groups of one utility (filed under different cross street names),
  // all the same pipe, so lanes are kept apart per utility and every group follows its utility.
  interface Lane {
    utility: UtilityKind;
    lateralM: number;
    digSpots: number;
    members: { ref: string; sign: 1 | -1 }[];
  }
  const blocks = new Map<string, Map<UtilityKind, Lane>>();
  groups.forEach((group, index) => {
    const ref = `permit-${index}`;
    const utility = group.properties.utility;
    const spacing = LATERAL_M[utility];
    const [line] = centerlinesOf(group);
    if (spacing === undefined || !line) return;
    const { key, sign } = blockOf(line);
    const block = blocks.get(key) ?? new Map<UtilityKind, Lane>();
    const lane = block.get(utility) ?? {
      utility,
      lateralM: sign * spacing,
      digSpots: 0,
      members: [],
    };
    const own = placed.get(ref);
    if (own && own.digSpots > lane.digSpots)
      Object.assign(lane, { lateralM: sign * own.lateralM, digSpots: own.digSpots });
    lane.members.push({ ref, sign });
    blocks.set(key, block.set(utility, lane));
  });

  const result = new Map<string, LanePlacement>();
  for (const block of blocks.values()) {
    // Lanes with the most notes behind them choose first; default-spaced lanes go last and
    // take the free spot nearest their default.
    const lanes = [...block.values()].sort((a, b) => b.digSpots - a.digSpots);
    if (!lanes[0]?.digSpots) continue;
    const taken: number[] = [];
    const moved = new Set<Lane>();
    for (const lane of lanes) {
      const free = (at: number) =>
        taken.every((other) => Math.abs(at - other) >= LANE_GAP_M - 1e-9);
      const candidates = [lane.lateralM, ...taken.flatMap((t) => [t - LANE_GAP_M, t + LANE_GAP_M])];
      const at = candidates
        .filter(free)
        .sort((a, b) => Math.abs(a - lane.lateralM) - Math.abs(b - lane.lateralM))[0]!;
      if (lane.digSpots || at !== lane.lateralM) moved.add(lane);
      lane.lateralM = at;
      taken.push(at);
    }
    for (const lane of moved) {
      for (const { ref, sign } of lane.members) {
        result.set(ref, { lateralM: sign * lane.lateralM, digSpots: lane.digSpots });
      }
    }
  }
  return result;
};

const drawnDepthOf = (utility: UtilityKind | null | undefined) => {
  const standard = utility && depthStandards()[utility];
  return standard ? drawnDepthFt(standard) : undefined;
};

const STORM_ONLY_SOURCES = new Set<string>([
  'sdInlets',
  'laInlets',
  'denInlets',
  'denStormManholes',
]);

export const buildAssets = (frame: LocalFrame, assets: AssetFeature[]): ScenePoint[] =>
  assets.map((asset, index) => ({
    ref: `asset-${index}`,
    kind: asset.properties.kind,
    utility: asset.properties.utility,
    position: frame.toLocal(asset.geometry.coordinates),
    depthFt: drawnDepthOf(asset.properties.utility),
    ...(asset.properties.drainage?.storm ? { stormSewer: true as const } : {}),
    // San Diego, Los Angeles and Denver keep runoff out of their sewers: an inlet drains only to
    // a storm drain, and LA's and Denver's storm drain structures sit on storm drains.
    ...(STORM_ONLY_SOURCES.has(asset.properties.sourceKey) ? { stormOnly: true as const } : {}),
  }));

/** Curb lines in local meters, which place crews' dig notes and the curb valve. */
export const curbsOf = (frame: LocalFrame, curbs: FeatureCollection): Vec2[][] =>
  curbs.features.flatMap((f) =>
    linesOf(f.geometry).map((line) => line.map((p) => frame.toLocal(p))),
  );

export const buildGround = (
  frame: LocalFrame,
  geometry: {
    curbs: FeatureCollection;
    roadbed: FeatureCollection;
    sidewalks: FeatureCollection;
    buildings: FeatureCollection;
  },
  streets: StreetSegment[],
): Pick<SceneData, 'roads' | 'sidewalks' | 'curbs' | 'buildings' | 'labels'> => {
  const project = (ring: number[][]) => ring.map((p) => frame.toLocal(p));
  const polygonsOf = (collection: FeatureCollection) =>
    collection.features.flatMap((f) => ringsOf(f.geometry).map((poly) => poly.map(project)));
  const roads = polygonsOf(geometry.roadbed);
  const sidewalks = polygonsOf(geometry.sidewalks);
  const curbs = curbsOf(frame, geometry.curbs);
  const buildings = geometry.buildings.features.flatMap((f) =>
    ringsOf(f.geometry).map((poly) => ({
      polygon: poly.map(project),
      heightM: Math.max(3, Number(f.properties?.heightM) || 0),
    })),
  );

  // One label per street, on its longest segment, laid flat along the road like paint.
  const longest = new Map<string, { path: Vec2[]; length: number }>();
  const pathsByStreet = new Map<string, Vec2[][]>();
  for (const street of streets) {
    for (const line of street.geometry.coordinates) {
      const path = line.map((p) => frame.toLocal(p));
      pathsByStreet.set(street.label, [...(pathsByStreet.get(street.label) ?? []), path]);
      const length = path
        .slice(1)
        .reduce((sum, p, i) => sum + Math.hypot(p[0] - path[i]![0], p[1] - path[i]![1]), 0);
      const current = longest.get(street.label);
      if (!current || length > current.length) longest.set(street.label, { path, length });
    }
  }
  const labels = [...longest.entries()].map(([text, { path }]) => {
    let angle = headingDegrees(path);
    // Keep text upright from the default camera.
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    return {
      text: streetName(text),
      position: midpoint(path),
      angle,
      paths: pathsByStreet.get(text) ?? [path],
    };
  });

  return { roads, sidewalks, curbs, buildings, labels };
};
