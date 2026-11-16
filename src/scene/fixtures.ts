import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import type { ScenePoint } from './build';
import type { AssetLink } from './assetLinks';
import type { Rgba } from './colors';
import {
  catchBasinMesh,
  hydrantBodyMesh,
  hydrantTrimMesh,
  linkKioskBodyMesh,
  linkKioskScreenMesh,
  manholeCoverMesh,
  openBoxMesh,
  streetLampLensMesh,
  streetLampPoleMesh,
} from './fixtureMeshes';
import { closestOnPolyline, type Vec2, type Vec3 } from './local';
import type { MeshData } from './meshes';

export type FixtureKind = AssetLink['kind'] | 'street-lamp' | 'linknyc' | 'traffic-signal';

/** A street fixture placed and turned so its street side faces the street. */
export interface FixturePose {
  ref: string;
  kind: FixtureKind;
  position: Vec2;
  /** Radians from +x (east) to the fixture's street side. */
  heading: number;
  link?: AssetLink;
}

// True size is a few pixels at street zoom; drawn half again as big, like the oversized pipes.
const FIXTURE_SCALE = 1.5;
// A typical precast basin chamber, about 3 by 4 ft in plan.
const BASIN_CHAMBER_M: Vec2 = [0.9, 1.2];
// The chamber's open top sits right under the grate, so the grate rests on it. A gap here, once
// the depth stretch was applied, made grates look like they were floating over their basins.
const BASIN_TOP_M = 0;

// A real davit is about 9 m tall. The building massing is kept under 4 m so it doesn't hide the
// street, and a true-height pole would tower over the block, so lamps are shrunk to match.
const LAMP_SCALE = 0.6;
// Lamps and kiosks stand a little back from the curb; farther than this, the curb found is
// probably across the street.
const CURB_REACH_M = 8;
// A signal's record is the middle of its intersection; the pole goes on the nearest corner,
// which in Manhattan is about half a roadway away.
const SIGNAL_CORNER_REACH_M = 20;
// Poles stand just behind the curb, clear of the gutter.
const SIGNAL_SETBACK_M = 0.6;

export const FIXTURE_KINDS = new Set<string>([
  'hydrant',
  'catch-basin',
  'manhole',
  'street-lamp',
  'linknyc',
  'traffic-signal',
]);

/** Direction from a point to the nearest curb, if one is close enough to trust. */
const towardCurb = (position: Vec2, curbs: Vec2[][]): number | null => {
  let best: { point: Vec2; distance: number } | null = null;
  for (const curb of curbs) {
    if (curb.length < 2) continue;
    const { point, distance } = closestOnPolyline(curb, position);
    if (!best || distance < best.distance) best = { point, distance };
  }
  // Right on the curb line the direction is noise.
  if (!best || best.distance > CURB_REACH_M || best.distance < 0.1) return null;
  return Math.atan2(best.point[1] - position[1], best.point[0] - position[0]);
};

/** The nearest curb point to an intersection, if there is one close enough: a corner. */
const nearestCurb = (position: Vec2, curbs: Vec2[][], reach: number): Vec2 | null => {
  let best: { point: Vec2; distance: number } | null = null;
  for (const curb of curbs) {
    if (curb.length < 2) continue;
    const { point, distance } = closestOnPolyline(curb, position);
    if (!best || distance < best.distance) best = { point, distance };
  }
  return best && best.distance <= reach ? best.point : null;
};

/**
 * A mast-arm pole on the corner, its arm reaching back over the intersection. Without curbs to
 * find a corner, there's no honest place to stand it, so the signal keeps its pin.
 */
const poseSignal = (point: ScenePoint, curbs: Vec2[][]): FixturePose | null => {
  const corner = nearestCurb(point.position, curbs, SIGNAL_CORNER_REACH_M);
  if (!corner) return null;
  const [dx, dy] = [corner[0] - point.position[0], corner[1] - point.position[1]];
  const length = Math.hypot(dx, dy);
  if (length < 0.5) return null;
  const position: Vec2 = [
    corner[0] + (dx / length) * SIGNAL_SETBACK_M,
    corner[1] + (dy / length) * SIGNAL_SETBACK_M,
  ];
  return {
    ref: point.ref,
    kind: 'traffic-signal',
    position,
    heading: Math.atan2(-dy, -dx),
  };
};

export const poseFixtures = (
  points: ScenePoint[],
  links: AssetLink[],
  curbs: Vec2[][],
): FixturePose[] => {
  const linkOf = new Map(links.map((link) => [link.ref, link]));
  return points.flatMap((point): FixturePose[] => {
    if (!FIXTURE_KINDS.has(point.kind)) return [];
    if (point.kind === 'traffic-signal') {
      const pose = poseSignal(point, curbs);
      return pose ? [pose] : [];
    }
    const link = linkOf.get(point.ref);
    // Toward the main is toward the street, so the grate lies along the curb and the hydrant's
    // big nozzle faces the road, as they're set in the field. Lamps and kiosks have no main, so
    // the curb tells which way the street is. Failing both, any way will do.
    const heading = link
      ? Math.atan2(link.to[1] - link.from[1], link.to[0] - link.from[0])
      : (towardCurb(point.position, curbs) ?? 0);
    return [
      {
        ref: point.ref,
        kind: point.kind as FixturePose['kind'],
        position: point.position,
        heading,
        ...(link ? { link } : {}),
      },
    ];
  });
};

/** Column-major: scale, then turn about z. */
const turned = (heading: number, [sx, sy, sz]: Vec3): number[] => {
  const [c, s] = [Math.cos(heading), Math.sin(heading)];
  // prettier-ignore
  return [
    c * sx, s * sx, 0, 0,
    -s * sy, c * sy, 0, 0,
    0, 0, sz, 0,
    0, 0, 0, 1,
  ];
};

/** The hydrant's painted body and its utility-colored trim, from code or a Blender model. */
export interface HydrantMeshes {
  body: MeshData;
  trim: MeshData;
}

/** The Blender signal (models/signal.py): galvanized pole and arm, dark heads, their lenses. */
export interface SignalMeshes {
  pole: MeshData;
  heads: MeshData;
  lenses: MeshData;
}

export const CODE_HYDRANT: HydrantMeshes = { body: hydrantBodyMesh(), trim: hydrantTrimMesh() };
const CATCH_BASIN = catchBasinMesh();
const MANHOLE_COVER = manholeCoverMesh();
const OPEN_BOX = openBoxMesh();
const LAMP_POLE = streetLampPoleMesh();
const LAMP_LENS = streetLampLensMesh();
const KIOSK_BODY = linkKioskBodyMesh();
const KIOSK_SCREENS = linkKioskScreenMesh();
// Glossy black glass, so the screens read without borrowing a utility color.
const GLASS = {
  ambient: 0.4,
  diffuse: 0.3,
  shininess: 120,
  specularColor: [220, 220, 220] as Vec3,
};

const CAST_IRON = {
  ambient: 0.45,
  diffuse: 0.6,
  shininess: 40,
  specularColor: [90, 90, 90] as Vec3,
};
const PAINT = { ambient: 0.5, diffuse: 0.6, shininess: 60, specularColor: [160, 160, 160] as Vec3 };

export interface FixtureColors {
  iron: Rgba;
  hydrantBody: Rgba;
  galvanized: Rgba;
  lampLens: Rgba;
  stainless: Rgba;
  screen: Rgba;
  /** Utility color for trim and chambers, already faded when another utility is in focus. */
  trim: (pose: FixturePose) => Rgba;
  chamber: (pose: FixturePose) => Rgba;
}

export const fixtureLayers = (
  poses: FixturePose[],
  zOf: (depthFt: number) => number,
  colors: FixtureColors,
  triggers: unknown[],
  hydrant: HydrantMeshes = CODE_HYDRANT,
  signal: SignalMeshes | null = null,
) => {
  const ofKind = (kind: FixturePose['kind']) => poses.filter((p) => p.kind === kind);
  const atStreet = (d: FixturePose): Vec3 => [d.position[0], d.position[1], 0];
  const scaled = (d: FixturePose | undefined) =>
    d ? turned(d.heading, [FIXTURE_SCALE, FIXTURE_SCALE, FIXTURE_SCALE]) : [];
  const hydrants = ofKind('hydrant');
  const basins = ofKind('catch-basin');
  const signals = signal ? ofKind('traffic-signal') : [];
  const lampScaled = (d: FixturePose | undefined) =>
    d ? turned(d.heading, [LAMP_SCALE, LAMP_SCALE, LAMP_SCALE]) : [];
  return [
    new SimpleMeshLayer<FixturePose>({
      id: 'hydrant-bodies',
      data: hydrants,
      mesh: hydrant.body,
      pickable: true,
      material: PAINT,
      getPosition: atStreet,
      getTransformMatrix: scaled,
      getColor: colors.hydrantBody,
    }),
    new SimpleMeshLayer<FixturePose>({
      id: 'hydrant-trim',
      data: hydrants,
      mesh: hydrant.trim,
      pickable: true,
      material: PAINT,
      getPosition: atStreet,
      getTransformMatrix: scaled,
      getColor: colors.trim,
      updateTriggers: { getColor: triggers },
    }),
    new SimpleMeshLayer<FixturePose>({
      id: 'catch-basin-grates',
      data: basins,
      mesh: CATCH_BASIN,
      pickable: true,
      material: CAST_IRON,
      getPosition: atStreet,
      getTransformMatrix: scaled,
      getColor: colors.iron,
    }),
    // The basin itself: a box under the grate, down to where its lead leaves for the sewer.
    new SimpleMeshLayer<FixturePose>({
      id: 'catch-basin-chambers',
      data: basins.filter((d) => d.link),
      mesh: OPEN_BOX,
      pickable: true,
      material: CAST_IRON,
      getPosition: (d) => [d.position[0], d.position[1], (zOf(d.link!.depthFt) + BASIN_TOP_M) / 2],
      getTransformMatrix: (d: FixturePose | undefined) =>
        d
          ? turned(d.heading, [
              BASIN_CHAMBER_M[0],
              BASIN_CHAMBER_M[1],
              BASIN_TOP_M - zOf(d.link!.depthFt),
            ])
          : [],
      getColor: colors.chamber,
      updateTriggers: { getPosition: triggers, getTransformMatrix: triggers, getColor: triggers },
    }),
    new SimpleMeshLayer<FixturePose>({
      id: 'manhole-covers',
      data: ofKind('manhole'),
      mesh: MANHOLE_COVER,
      pickable: true,
      material: CAST_IRON,
      getPosition: atStreet,
      getTransformMatrix: scaled,
      getColor: colors.iron,
    }),
    new SimpleMeshLayer<FixturePose>({
      id: 'street-lamp-poles',
      data: ofKind('street-lamp'),
      mesh: LAMP_POLE,
      pickable: true,
      material: PAINT,
      getPosition: atStreet,
      getTransformMatrix: lampScaled,
      getColor: colors.galvanized,
    }),
    new SimpleMeshLayer<FixturePose>({
      id: 'street-lamp-lenses',
      data: ofKind('street-lamp'),
      mesh: LAMP_LENS,
      pickable: true,
      // Lit from inside, so the scene's lights shouldn't shade it.
      material: false,
      getPosition: atStreet,
      getTransformMatrix: lampScaled,
      getColor: colors.lampLens,
    }),
    // Shrunk with the lamps, for the same reason: true height would tower over the massing.
    ...(signal
      ? [
          new SimpleMeshLayer<FixturePose>({
            id: 'signal-poles',
            data: signals,
            mesh: signal.pole,
            pickable: true,
            material: PAINT,
            getPosition: atStreet,
            getTransformMatrix: lampScaled,
            getColor: colors.galvanized,
          }),
          new SimpleMeshLayer<FixturePose>({
            id: 'signal-heads',
            data: signals,
            mesh: signal.heads,
            pickable: true,
            material: PAINT,
            getPosition: atStreet,
            getTransformMatrix: lampScaled,
            getColor: colors.screen,
          }),
          // Unlit and pale, not red, amber and green: on this map those hues mean utilities.
          new SimpleMeshLayer<FixturePose>({
            id: 'signal-lenses',
            data: signals,
            mesh: signal.lenses,
            pickable: true,
            material: false,
            getPosition: atStreet,
            getTransformMatrix: lampScaled,
            getColor: colors.lampLens,
          }),
        ]
      : []),
    new SimpleMeshLayer<FixturePose>({
      id: 'link-kiosk-bodies',
      data: ofKind('linknyc'),
      mesh: KIOSK_BODY,
      pickable: true,
      material: PAINT,
      getPosition: atStreet,
      getTransformMatrix: (d: FixturePose | undefined) => (d ? turned(d.heading, [1, 1, 1]) : []),
      getColor: colors.stainless,
    }),
    new SimpleMeshLayer<FixturePose>({
      id: 'link-kiosk-screens',
      data: ofKind('linknyc'),
      mesh: KIOSK_SCREENS,
      pickable: true,
      material: GLASS,
      getPosition: atStreet,
      getTransformMatrix: (d: FixturePose | undefined) => (d ? turned(d.heading, [1, 1, 1]) : []),
      getColor: colors.screen,
    }),
  ];
};
