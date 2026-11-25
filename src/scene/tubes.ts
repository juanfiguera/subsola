import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { depthStandards } from '../depth';
import type { UtilityKind } from '../utilities';
import type { PipePiece } from './build';
import type { ServiceLine } from './services';
import type { AssetLink } from './assetLinks';
import { INK, edgeOf, type PipeColored, type Rgba } from './colors';
import { headingMatrix, segmentMatrix, sleeveMesh, tubeMesh, type MeshData } from './meshes';
import { valveMesh } from './fixtureMeshes';
import { FLOW, type FlowExtensionProps } from './flow';
import type { Vec2, Vec3 } from './local';

// Drawn a little larger than typical NYC pipes so they read at street scale, and in proportion
// to each other: sewers are the biggest, gas services the smallest.
export const PIPE_RADIUS_M: Record<UtilityKind, number> = {
  electric: 0.36,
  gas: 0.3,
  telecom: 0.32,
  water: 0.4,
  sewer: 0.55,
  steam: 0.4,
  capital: 0.3,
};

/** A pipe's drawn radius: its own when its size is known, else its utility's. */
export const radiusOf = (pipe: { utility: UtilityKind; radiusM?: number }) =>
  pipe.radiusM ?? PIPE_RADIUS_M[pipe.utility];

/**
 * Utilities with no published burial depth draw as glass conduits with a cable inside. The
 * glass says "we don't know exactly where", and electric and telecom really are cables in conduit.
 */
export const isConduit = (utility: UtilityKind) => depthStandards()[utility]?.basis === 'unknown';

export interface Joint {
  ref: string;
  utility: UtilityKind;
  position: Vec2;
  depthFt: number;
  /** The points before and after this one on its run: one at an end, two at a bend. */
  neighbors: Vec2[];
  radiusM?: number;
  recycled?: true;
}

/** A coupling sleeve lying along a pipe from a joint. */
export interface Sleeve {
  utility: UtilityKind;
  a: Vec2;
  b: Vec2;
  depthFt: number;
  radiusM?: number;
  recycled?: true;
}

// How far a sleeve runs along the pipe from its joint, in pipe radii.
const SLEEVE_REACH = 0.9;
const CAP_OVERHANG = 0.15;
// Runs that turn less than this pass straight through a coupling; sharper turns get an elbow.
const ELBOW_MIN_TURN_RAD = (12 * Math.PI) / 180;

/**
 * Real pipe joins with couplings and turns with elbows, so each joint becomes a sleeve along
 * every pipe that meets it (an end gets one, which reads as a cap). Where the run turns, both
 * sleeves reach back past the joint just far enough to cover the outside of the corner, so the
 * two hubs overlap into one squared elbow, the way a cast fitting looks. A ball there instead
 * stood out as a knob, worst where the bend sits inside a bigger main and only the ball shows.
 */
export const fittingsOf = (joints: Joint[]): Sleeve[] => {
  const sleeves: Sleeve[] = [];
  for (const joint of joints) {
    const reach = radiusOf(joint) * SLEEVE_REACH;
    const directions = joint.neighbors.flatMap((neighbor) => {
      const dx = neighbor[0] - joint.position[0];
      const dy = neighbor[1] - joint.position[1];
      const length = Math.hypot(dx, dy);
      return length ? [{ dx, dy, length }] : [];
    });
    const [first, second] = directions;
    // Straight through, the two directions point opposite ways.
    const turn =
      first && second
        ? Math.PI -
          Math.acos(
            Math.max(
              -1,
              Math.min(
                1,
                (first.dx * second.dx + first.dy * second.dy) / (first.length * second.length),
              ),
            ),
          )
        : 0;
    const radius = radiusOf(joint) * FITTING_SCALE;
    // An end cap closes over the pipe end; an elbow's hubs cross to cover the outer corner.
    const back =
      directions.length === 1
        ? reach * CAP_OVERHANG
        : turn >= ELBOW_MIN_TURN_RAD
          ? Math.min(radius * Math.tan(turn / 2), radius)
          : 0;
    for (const { dx, dy, length } of directions) {
      // Half a short segment at most, so sleeves from its two ends never overlap.
      const share = Math.min(reach, length / 2) / length;
      sleeves.push({
        utility: joint.utility,
        a: [joint.position[0] - (dx * back) / length, joint.position[1] - (dy * back) / length],
        b: [joint.position[0] + dx * share, joint.position[1] + dy * share],
        depthFt: joint.depthFt,
        ...(joint.radiusM ? { radiusM: joint.radiusM } : {}),
        ...(joint.recycled ? { recycled: true as const } : {}),
      });
    }
  }
  return sleeves;
};

// The scene recomposes every frame while anything on it moves (active work pulses on most
// streets). A new array here reads to deck.gl as new data, and it recomputes every pipe piece's
// matrix: 130 ms a frame on an M2. So the split is kept until the pipes themselves change.
let tubeCache: {
  pieces: PipePiece[];
  joints: Joint[];
  sleeves: Sleeve[];
  solid: PipePiece[];
  conduits: PipePiece[];
} | null = null;

const splitTubes = (pieces: PipePiece[], joints: Joint[]) => {
  if (tubeCache?.pieces !== pieces || tubeCache.joints !== joints) {
    tubeCache = {
      pieces,
      joints,
      sleeves: fittingsOf(joints),
      solid: pieces.filter((d) => !isConduit(d.utility)),
      conduits: pieces.filter((d) => isConduit(d.utility)),
    };
  }
  return tubeCache;
};

export interface TubeInput {
  pieces: PipePiece[];
  joints: Joint[];
  selected: PipePiece[];
  zOf: (depthFt: number) => number;
  /** Body color for a pipe, already faded when another utility is in focus. */
  bodyColor: (pipe: PipeColored) => Rgba;
  fittingColor: (pipe: PipeColored) => Rgba;
  glassColor: (utility: UtilityKind) => Rgba;
  /** What inferred pipes are mixed toward: white on the light ground, the ground itself on dark. */
  assumedToward?: [number, number, number];
  /** The glass sleeve around the selected pipe. */
  selectedColor?: Rgba;
  triggers: unknown[];
  flowEnabled: boolean;
  detail: Detail;
}

const TUBE = tubeMesh();
// One matrix reused by every per-piece accessor; deck.gl copies each result before the next call.
const SCRATCH = new Array<number>(16);
// Service lines stop at the lot line, where an open tube showed as a hollow ring end-on.
const CAPPED_TUBE = sleeveMesh();
const VALVE = valveMesh();

/**
 * How many sides the main pipes get. Tens of thousands of pipe pieces are drawn at once, and
 * zoomed out a sewer is a few pixels across, so 24 sides is wasted work. Each level keeps the
 * outline of the widest pipe (the sewer) within about half a pixel of a true circle: one meter is
 * 2^zoom pixels in this orthographic view.
 */
export type Detail = 'low' | 'medium' | 'high';

export const detailForZoom = (zoom: number): Detail =>
  zoom < 2.5 ? 'low' : zoom < 4.5 ? 'medium' : 'high';

const MESHES: Record<Detail, { tube: MeshData; sleeve: MeshData }> = {
  low: { tube: tubeMesh(6), sleeve: sleeveMesh(6) },
  medium: { tube: tubeMesh(12), sleeve: sleeveMesh(12) },
  high: { tube: TUBE, sleeve: sleeveMesh() },
};

// Matte, like painted clay: soft highlights, no gloss.
const CLAY = { ambient: 0.5, diffuse: 0.62, shininess: 20, specularColor: [60, 60, 60] as Vec3 };
const GLASS = {
  ambient: 0.7,
  diffuse: 0.25,
  shininess: 120,
  specularColor: [255, 255, 255] as Vec3,
};
const CORE_SHARE = 0.3;
// Lines carried through blocks with no permit are the same pipe in a paler tone, so they read as
// the same utility but plainly less certain. Paler means toward the ground: white on the light
// model, dark on the dark one, so an inferred pipe never outshines a surveyed one.
const ASSUMED_PALE = 0.55;
const WHITE_RGB: [number, number, number] = [255, 255, 255];

const paleIfAssumed = (
  color: Rgba,
  piece: PipePiece,
  toward: [number, number, number] = WHITE_RGB,
): Rgba =>
  piece.assumed
    ? [
        Math.round(color[0] + (toward[0] - color[0]) * ASSUMED_PALE),
        Math.round(color[1] + (toward[1] - color[1]) * ASSUMED_PALE),
        Math.round(color[2] + (toward[2] - color[2]) * ASSUMED_PALE),
        color[3],
      ]
    : color;
const FITTING_SCALE = 1.16;
const SLEEVE_SCALE = 1.7;

export const tubeLayers = ({
  pieces,
  joints,
  selected,
  zOf,
  bodyColor,
  fittingColor,
  glassColor,
  assumedToward = WHITE_RGB,
  selectedColor = [INK[0], INK[1], INK[2], 70],
  triggers,
  flowEnabled,
  detail,
}: TubeInput) => {
  const mesh = MESHES[detail];
  const at = (p: Vec2, depthFt: number): Vec3 => [p[0], p[1], zOf(depthFt)];
  const middle = (d: PipePiece): Vec3 =>
    at([(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2], d.depthFt);
  // deck.gl probes the accessor with data[0] to see if it is set, which is undefined for an
  // empty layer, so a missing piece has to be tolerated.
  const matrix = (d: PipePiece | undefined, scale: number) =>
    d ? segmentMatrix(at(d.a, d.depthFt), at(d.b, d.depthFt), radiusOf(d) * scale, SCRATCH) : [];

  const { sleeves, solid, conduits } = splitTubes(pieces, joints);
  const shape = { getPosition: middle };

  return [
    new SimpleMeshLayer<PipePiece, FlowExtensionProps<PipePiece>>({
      id: 'tubes',
      data: solid,
      mesh: mesh.tube,
      pickable: true,
      material: CLAY,
      extensions: [FLOW],
      // Only sewers get a direction, estimated from the street's fall; see slope.ts.
      getFlow: (d) => d.flow ?? 0,
      flowEnabled,
      ...shape,
      getTransformMatrix: (d) => matrix(d, 1),
      getColor: (d) => paleIfAssumed(bodyColor(d), d, assumedToward),
      updateTriggers: { getPosition: triggers, getTransformMatrix: triggers, getColor: triggers },
    }),
    new SimpleMeshLayer<PipePiece>({
      id: 'conduit-cores',
      data: conduits,
      mesh: mesh.tube,
      material: CLAY,
      ...shape,
      getTransformMatrix: (d) => matrix(d, CORE_SHARE),
      getColor: (d) => paleIfAssumed(bodyColor(d), d, assumedToward),
      updateTriggers: { getPosition: triggers, getTransformMatrix: triggers, getColor: triggers },
    }),
    new SimpleMeshLayer<Sleeve>({
      id: 'fitting-sleeves',
      data: sleeves,
      mesh: mesh.sleeve,
      material: CLAY,
      getPosition: (d) => at([(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2], d.depthFt),
      getTransformMatrix: (d: Sleeve | undefined) =>
        d
          ? segmentMatrix(
              at(d.a, d.depthFt),
              at(d.b, d.depthFt),
              radiusOf(d) * FITTING_SCALE,
              SCRATCH,
            )
          : [],
      getColor: (d) => fittingColor(d),
      updateTriggers: { getPosition: triggers, getTransformMatrix: triggers, getColor: triggers },
    }),
    // Glass goes last and doesn't write depth, so everything behind it still shows through.
    new SimpleMeshLayer<PipePiece>({
      id: 'conduit-glass',
      data: conduits,
      mesh: mesh.tube,
      pickable: true,
      material: GLASS,
      ...shape,
      getTransformMatrix: (d) => matrix(d, 1),
      getColor: (d) => paleIfAssumed(glassColor(d.utility), d, assumedToward),
      parameters: { depthWriteEnabled: false },
      updateTriggers: { getPosition: triggers, getTransformMatrix: triggers, getColor: triggers },
    }),
    new SimpleMeshLayer<PipePiece>({
      id: 'selected-sleeve',
      data: selected,
      mesh: mesh.tube,
      material: GLASS,
      ...shape,
      getTransformMatrix: (d) => matrix(d, SLEEVE_SCALE),
      getColor: selectedColor,
      parameters: { depthWriteEnabled: false },
      updateTriggers: { getPosition: triggers, getTransformMatrix: triggers },
    }),
  ];
};

// Water services are an inch or two across and house sewers several inches, far thinner than the
// mains, but drawn thick enough to see and pick at street scale.
export const SERVICE_RADIUS_M: Record<ServiceLine['utility'], number> = {
  water: 0.12,
  sewer: 0.18,
};
// Valve bodies a little fuller than their pipe, as the castings are.
const VALVE_SCALE = 1.2;

export const serviceLayers = (
  services: ServiceLine[],
  zOf: (depthFt: number) => number,
  color: (utility: ServiceLine['utility']) => Rgba,
  triggers: unknown[],
  flowEnabled: boolean,
) => [
  new SimpleMeshLayer<ServiceLine, FlowExtensionProps<ServiceLine>>({
    id: 'service-lines',
    data: services,
    mesh: CAPPED_TUBE,
    pickable: true,
    material: CLAY,
    extensions: [FLOW],
    // Each line runs from the main (a) to the lot (b): water flows in, sewage flows out.
    getFlow: (d) => (d.utility === 'water' ? 1 : -1),
    flowEnabled,
    getPosition: (d) => [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2, zOf(d.depthFt)],
    getTransformMatrix: (d: ServiceLine | undefined) =>
      d
        ? segmentMatrix(
            [d.a[0], d.a[1], zOf(d.depthFt)],
            [d.b[0], d.b[1], zOf(d.depthFt)],
            SERVICE_RADIUS_M[d.utility],
            SCRATCH,
          )
        : [],
    getColor: (d) => color(d.utility),
    updateTriggers: { getPosition: triggers, getTransformMatrix: triggers, getColor: triggers },
  }),
  // The curb stop: a gate valve on the line with its nut facing up the curb box.
  new SimpleMeshLayer<ServiceLine>({
    id: 'curb-valves',
    data: services.filter((d) => d.curbValve),
    mesh: VALVE,
    pickable: true,
    material: CLAY,
    getPosition: (d) => [d.curbValve![0], d.curbValve![1], zOf(d.depthFt)],
    getTransformMatrix: (d: ServiceLine | undefined) =>
      d
        ? headingMatrix(d.b[0] - d.a[0], d.b[1] - d.a[1], SERVICE_RADIUS_M[d.utility] * VALVE_SCALE)
        : [],
    getColor: (d) => edgeOf(d.utility, color(d.utility)[3]),
    updateTriggers: { getPosition: triggers, getColor: triggers },
  }),
];

// Basin and manhole chambers are a few feet across; a hydrant barrel is much thinner.
const SHAFT_RADIUS_M: Record<AssetLink['kind'], number> = {
  'catch-basin': 0.45,
  manhole: 0.4,
  hydrant: 0.12,
};
// DEP standards: 12-inch basin connections (Sewer Design Standards SE1 notes) and a 6-inch
// hydrant branch (WM0020). Drawn larger than true, in proportion to the service lines.
const BRANCH_RADIUS_M: Partial<Record<AssetLink['kind'], number>> = {
  'catch-basin': 0.2,
  hydrant: 0.15,
};

export const assetLinkLayers = (
  links: AssetLink[],
  zOf: (depthFt: number) => number,
  color: (utility: AssetLink['utility']) => Rgba,
  shaftColor: (utility: AssetLink['utility']) => Rgba,
  triggers: unknown[],
  flowEnabled: boolean,
) => {
  return [
    new SimpleMeshLayer<AssetLink>({
      id: 'asset-shafts',
      // Catch basins get a box chamber with their grate instead.
      data: links.filter((d) => d.kind !== 'catch-basin'),
      mesh: TUBE,
      pickable: true,
      material: CLAY,
      getPosition: (d) => [d.from[0], d.from[1], zOf(d.depthFt) / 2],
      getTransformMatrix: (d: AssetLink | undefined) =>
        d
          ? segmentMatrix(
              [d.from[0], d.from[1], 0],
              [d.from[0], d.from[1], zOf(d.depthFt)],
              SHAFT_RADIUS_M[d.kind],
              SCRATCH,
            )
          : [],
      getColor: (d) => shaftColor(d.utility),
      updateTriggers: { getPosition: triggers, getTransformMatrix: triggers, getColor: triggers },
    }),
    new SimpleMeshLayer<AssetLink, FlowExtensionProps<AssetLink>>({
      id: 'asset-branches',
      data: links.filter((link) => BRANCH_RADIUS_M[link.kind]),
      mesh: TUBE,
      pickable: true,
      material: CLAY,
      extensions: [FLOW],
      // A basin lead drains from the grate (from) to the sewer. A hydrant branch holds still
      // water until the hydrant is opened, so it gets no motion.
      getFlow: (d) => (d.kind === 'catch-basin' ? 1 : 0),
      flowEnabled,
      getPosition: (d) => [(d.from[0] + d.to[0]) / 2, (d.from[1] + d.to[1]) / 2, zOf(d.depthFt)],
      getTransformMatrix: (d: AssetLink | undefined) =>
        d
          ? segmentMatrix(
              [d.from[0], d.from[1], zOf(d.depthFt)],
              [d.to[0], d.to[1], zOf(d.depthFt)],
              BRANCH_RADIUS_M[d.kind]!,
              SCRATCH,
            )
          : [],
      getColor: (d) => color(d.utility),
      updateTriggers: { getPosition: triggers, getTransformMatrix: triggers, getColor: triggers },
    }),
    new SimpleMeshLayer<AssetLink>({
      id: 'hydrant-valves',
      data: links.filter((d) => d.valve),
      mesh: VALVE,
      pickable: true,
      material: CLAY,
      getPosition: (d) => [d.valve![0], d.valve![1], zOf(d.depthFt)],
      getTransformMatrix: (d: AssetLink | undefined) =>
        d
          ? headingMatrix(
              d.to[0] - d.from[0],
              d.to[1] - d.from[1],
              BRANCH_RADIUS_M.hydrant! * VALVE_SCALE,
            )
          : [],
      getColor: (d) => edgeOf(d.utility, color(d.utility)[3]),
      updateTriggers: { getPosition: triggers, getColor: triggers },
    }),
  ];
};
