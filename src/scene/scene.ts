import {
  AmbientLight,
  Deck,
  DirectionalLight,
  LightingEffect,
  LinearInterpolator,
  OrbitView,
  type OrbitViewState,
  type Layer,
  type PickingInfo,
} from '@deck.gl/core';
import {
  BitmapLayer,
  IconLayer,
  LineLayer,
  PathLayer,
  ScatterplotLayer,
  SolidPolygonLayer,
  TextLayer,
} from '@deck.gl/layers';
import { setLoaderOptions } from '@loaders.gl/core';
import { depthStandards, drawnDepthFt, FEET_TO_METERS, formatFeet } from '../depth';
import { RECYCLED_WATER, UTILITY_STYLES, type UtilityKind } from '../utilities';
import { isRecycled, isStormDrain } from '../sources/mains';
import type { AssetKind } from '../sources/assets';
import type {
  PipePiece,
  PipeRun,
  SceneBuilding,
  SceneData,
  ScenePoint,
  StreetLabel,
} from './build';
import {
  FONT,
  colorOf,
  edgeOf,
  hexOf,
  inkRgb,
  pipeColorOf,
  pipeEdgeOf,
  pipeTintOf,
  tintOf,
  type Rgba,
} from './colors';
import {
  closestOnPolyline,
  distance2,
  nearestFraction,
  pointAlong,
  polylineLength,
  type Vec2,
  type Vec3,
} from './local';
import { probeLayers, workZoneLayers, type ProbeView, type WorkZone } from './overlays';
import { pinIcon } from './pins';
import { networkOf } from './assetStyle';
import { stageLayers } from './staging';
import { labelBox, placeFirstFit, type Box } from './declutter';
import { clipToSection, crossesSection, crossingOf, inSection, type Section } from './section';
import {
  radiusOf,
  assetLinkLayers,
  detailForZoom,
  serviceLayers,
  tubeLayers,
  type Joint,
} from './tubes';
import { linkAssets, type AssetLink } from './assetLinks';
import {
  CODE_HYDRANT,
  fixtureLayers,
  poseFixtures,
  type FixturePose,
  type HydrantMeshes,
  type SignalMeshes,
} from './fixtures';
import type { DigSpot } from './digSpots';
import { issuedSince } from '../brief';
import type { ServiceLine } from './services';
import type { ServiceMaterial } from '../sources/services';
import { currentTheme, onThemeChange } from '../theme';
import { scenePalette, type ScenePalette } from './palette';

// Deck loads its icons (data: URLs) through loaders.gl, whose workers default to its CDN on
// unpkg.com. The CSP blocks that and the site should never reach a third-party CDN; nothing
// loaded here is heavy enough to need a worker, so they're off for every load.
setLoaderOptions({ core: { worker: false } });

export type Ground = 'plan' | 'photo';
export type Preset = 'above' | 'angled' | 'underground';
export type { ProbeView, WorkZone };

export interface SceneState {
  data: SceneData;
  stretch: number;
  ground: Ground;
  /** Aerial photo tiles, already positioned in local meters. */
  photo: { image: HTMLImageElement; bounds: [number, number, number, number] }[];
  /** Utility kinds, asset kinds and 'work' switched off in the layer list. */
  hidden: Set<
    | UtilityKind
    | AssetKind
    | 'work'
    | 'services'
    | 'house-sewers'
    | 'recycled'
    | 'dig-spots'
    | 'flow'
  >;
  selectedRef: string | null;
  emphasizedUtility: string | null;
  /** Only digs issued this year or later are painted on the street; null for all of them. */
  since: number | null;
  /** Where the tag stands, which follows the address nearest the view. */
  address: { label: string; position: Vec2 } | null;
  workZones: WorkZone[];
  probe: ProbeView | null;
  /** Waiting for the user to pick a spot to dig. */
  probing: boolean;
  motion: boolean;
}

export interface SceneHandlers {
  onSelect: (ref: string | null) => void;
  onHover: (ref: string | null, x: number, y: number) => void;
  onProbe: (point: Vec2) => void;
  /** Screen boxes covered by panels floating over the map, which labels should stay out of. */
  obstacles: () => Box[];
  onCamera: (camera: CameraReading) => void;
  /** Scrolled out past the widest zoom: the user wants more than this street. */
  onZoomOutPastLimit: () => void;
}

/** A camera position in scene terms: what a shared link stores. */
export interface CameraPose {
  target: Vec2;
  zoom: number;
  /** rotationX: 90 is straight down, below 0 is under the street. */
  tilt: number;
  /** rotationOrbit, in degrees. */
  bearing: number;
}

/** Which way the map points on screen, in degrees clockwise from screen up. */
export interface CameraReading {
  north: number;
  east: number;
  /** The camera is under the street, looking up. East and west then swap sides on screen. */
  below: boolean;
}

const FLOW_FRAME_MS = 33;

// A light architectural model: pale roadbed, white massing, gray line work, or the same a few
// steps down in dark mode (palette.ts). Pipes are the only saturated color in the scene, so they
// are what the eye lands on.

// Lead and galvanized lines are the ones an owner needs to act on, so they get the ink fill the
// address tag uses: it stands out without borrowing another utility's color. Unknown is hollow,
// since nobody has checked.
const serviceMarker = (
  material: ServiceMaterial,
  palette: ScenePalette,
): { fill: Rgba; line: Rgba } =>
  material === 'unknown'
    ? { fill: palette.hollow, line: colorOf('water') }
    : { fill: material === 'non-lead' ? colorOf('water') : palette.ink, line: palette.halo };

/** The utility ring a street feature wears, if it's part of a network (see assetStyle.ts). */
const ringOf = (point: ScenePoint): UtilityKind | null =>
  point.kind === 'permit-point' ? null : networkOf(point.kind, point.utility);

const withAlpha = (color: Rgba, alpha: number): Rgba => [color[0], color[1], color[2], alpha];

// The map opens on the pipes, so while the first draw is staged (staging.ts) they and their
// labels come on first, then the ground around them, then everything else.
const PIPES_FIRST = /^(tubes|conduit-|service-|surface-traces|pipe-labels|address-)/;
const GROUND_NEXT = /^(roads|road-slab|sidewalk-slab|curbs|buildings|building-edges)$/;
const stagePriority = (id: string) => (PIPES_FIRST.test(id) ? 0 : GROUND_NEXT.test(id) ? 1 : 2);

/** Thin line work in a utility's hue: a darker edge on the light ground, a lighter one on dark. */
const edgeIn = (palette: ScenePalette, utility: UtilityKind | null, alpha = 255): Rgba => {
  if (palette.theme === 'light') return edgeOf(utility, alpha);
  const [r, g, b] = colorOf(utility);
  const { toward, amount } = palette.edgeMix;
  const mix = (c: number, t: number) => c + (t - c) * amount;
  return [mix(r, toward[0]), mix(g, toward[1]), mix(b, toward[2]), alpha];
};

// The roadbed starts darkening below this tilt and is fully dark at street level.
const LOW_TILT_START = 25;
const LOW_TILT_FULL = 5;
// The road slab is a marker for "the street is here", not a measurement, so it keeps one
// thickness while the depth stretch pushes the pipes down. That leaves room between the road
// and the shallow pipes, which really do sit within a foot or so of each other.
const SLAB_M = 0.5;
// Room left between the slab and a pipe pushed down to clear it, so it doesn't look glued on.
const UNDER_SLAB_GAP_M = 0.3;
// Half the length of the ticks that cap each dimension line.
const DIMENSION_TICK_M = 0.35;
const DIMENSION_GAP_PX = 6;
const DIMENSION_MIN_PX = 14;
// Within this many degrees of level, the view becomes a section: a slice this many meters
// either side of the view center, about one street's width plus sidewalks.
const SECTION_TILT = 10;
const SECTION_HALF_WIDTH_M = 18;
// About one house frontage, so a section shows the service to the lot at the cut on each side.
const SERVICE_SECTION_HALF_WIDTH_M = 4;
// Street tags show for streets this close to the view center, near the closest spot on each.
const STREET_TAG_RADIUS_M = 120;
// A tag right at the closest spot often lands on a corner, where two street names pile up and
// neither clearly belongs to its own street. A little way along the street it's unambiguous.
// In screen pixels, so the spots stay on screen however close the camera is.
const STREET_TAG_SPOTS_PX = [250, -250, 450, -450, 120, -120, 0];
// Each street's name is painted once, mid block. From this close that spot is usually off
// screen, so the street tags fade in over these zooms as the painted names fade out.
const STREET_TAGS_ZOOM_START = 3.5;
const STREET_TAGS_ZOOM_FULL = 4;

/** One tag per nearby street, at its closest point to the view center, nearest street first. */
const streetTagsNear = (streets: StreetLabel[], center: Vec2, metersPerPixel: number) =>
  streets
    .flatMap((street) => {
      const nearest = street.paths
        .map((path) => ({ path, ...closestOnPolyline(path, center) }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (!nearest || nearest.distance > STREET_TAG_RADIUS_M) return [];
      const length = polylineLength(nearest.path) || 1;
      const spots = STREET_TAG_SPOTS_PX.map(
        (shift) => nearest.fraction + (shift * metersPerPixel) / length,
      )
        .filter((fraction) => fraction >= 0 && fraction <= 1)
        .map((fraction) => pointAlong(nearest.path, fraction));
      return [{ text: street.text, spots, distance: nearest.distance }];
    })
    .sort((a, b) => a.distance - b.distance);

// Buildings are low massing, not true height: real heights would hide half the street at an angle.
const massingHeight = (building: SceneBuilding) =>
  Math.min(4, Math.max(2.5, building.heightM * 0.2));
// Pins float this high over the thing they mark, on a thin stem.
const PIN_LIFT_M = 3;
// From this close the fixtures themselves are big enough to find, and pins would float over them.
const MODELS_ONLY_ZOOM = 5;
// Fixtures that line every block: a DC address has a thousand lamps around it. Farther out than
// this they're dots, since as pins they covered the pipes the map is for. Rarer ones keep pins.
const CROWDED_KINDS = new Set<ScenePoint['kind']>([
  'street-lamp',
  'catch-basin',
  'traffic-signal',
  'manhole',
  // Con Edison's network vaults: over a thousand around Union Square.
  'electric-structure',
]);
const CROWDED_PIN_ZOOM = 4;
// How often the scene redraws when only active work is pulsing: smooth enough for a slow glow.
const PULSE_FRAME_MS = 66;
// Half the arm of a painted dig mark, about the size crews spray.
const DIG_MARK_M = 0.8;
// Cast iron for grates and covers; NYC hydrants are mostly painted silver.
const IRON: Rgba = [70, 74, 82, 255];
const HYDRANT_SILVER: Rgba = [196, 201, 208, 255];
const PRECAST_CONCRETE: Rgba = [176, 172, 164, 255];
const GALVANIZED: Rgba = [150, 156, 163, 255];
const LAMP_LENS_WARM: Rgba = [255, 238, 196, 255];
const STAINLESS: Rgba = [184, 189, 196, 255];
const SCREEN_BLACK: Rgba = [24, 27, 33, 255];

/**
 * Short form for on-map labels: "Water, 3 ft 5 in" or "Electric, depth unknown". It gives the
 * depth the pipe is drawn at, which the section's dimension line measures; the cards give the
 * full range.
 */
/** What colors a run's label: its utility, or purple for recycled water. */
const labelPipe = (run: PipeRun) =>
  isRecycled(run.surveyed) ? { utility: run.utility, recycled: true as const } : run;

/**
 * "Sewer, 9 ft" for a mapped main's own measured depth; "Gas, est. 1 ft 6 in" for the city's
 * standard, so a guess never reads as a measurement.
 */
const pipeLabelText = (run: PipeRun) => {
  const measured = run.surveyed?.depthFt;
  const standard = depthStandards()[run.utility]!;
  const depth =
    measured != null
      ? formatFeet(Math.round(measured * 2) / 2)
      : standard.basis === 'unknown'
        ? 'depth unknown'
        : `est. ${formatFeet(drawnDepthFt(standard))}`;
  const label = isRecycled(run.surveyed)
    ? RECYCLED_WATER.label
    : isStormDrain(run.surveyed)
      ? 'Storm drain'
      : UTILITY_STYLES[run.utility].label;
  return `${label}, ${depth}`;
};

/**
 * The scene recomposes every frame while anything on it moves, and most layers' data is filtered
 * afresh each time. deck.gl takes a new array as new data and recomputes every attribute, 130 ms a
 * frame on an M2, so an array holding the same items in the same order counts as unchanged.
 */
const sameItems = (next: unknown, previous: unknown) =>
  next === previous ||
  (Array.isArray(next) &&
    Array.isArray(previous) &&
    next.length === previous.length &&
    next.every((item, i) => item === previous[i]));

interface PipeLabel {
  run: PipeRun;
  position: Vec3;
  text: string;
  /** Other spots along the same pipe to try, best first, if `position` collides. */
  alternates: Vec3[];
}

// One depth tick every this many 2 m pieces: about every 14 m along a pipe.
const TICK_EVERY = 7;
// Labels only for blocks near the middle of the view; farther ones would just be clutter.
const LABEL_RADIUS_M = 140;
const PIPE_LABEL_LIFT_PX = 12;
// When the row right above the pipes is full (common side-on, where every pipe shares one
// line), a tag may step up a row.
const PIPE_LABEL_ROWS_PX = [PIPE_LABEL_LIFT_PX, PIPE_LABEL_LIFT_PX + 24];
const SAME_LABEL_GAP_PX = 420;
// Where else along its pipe a crowded label may move, in meters, nearest first.
const LABEL_ALTERNATE_M = [14, -14, 28, -28, 45, -45];
// The address tag floats this high over the lot on its stem.
const ADDRESS_TAG_M = 10;
// Labels sit on each pipe at the spot nearest the view center, nudged along the pipe by a
// different amount per utility so labels on neighboring pipes never stack.
const LABEL_SHIFT_M: Record<UtilityKind, number> = {
  electric: -30,
  gas: -18,
  telecom: -6,
  water: 6,
  sewer: 18,
  steam: 30,
  capital: 0,
};

const lighting = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.3 }),
  sun: new DirectionalLight({ color: [255, 255, 255], intensity: 1.6, direction: [-2, -3, -6] }),
  // A soft fill from below so pipes seen from underground aren't flat.
  fill: new DirectionalLight({ color: [220, 228, 255], intensity: 0.5, direction: [2, 3, 4] }),
});
const MASSING_MATERIAL = {
  ambient: 0.75,
  diffuse: 0.3,
  shininess: 4,
  specularColor: [255, 255, 255] as Vec3,
};
// White highlights on white massing vanish; on the dark massing they'd wash every roof out to
// white, so the dark model gets a faint sheen instead.
const DARK_MASSING_MATERIAL = { ...MASSING_MATERIAL, specularColor: [24, 27, 33] as Vec3 };

const PRESETS: Record<Preset, Partial<OrbitViewState>> = {
  above: { rotationX: 90, zoom: 2.4 },
  // Far enough back that a wide screen shows the cross streets and the whole run of pipes between.
  angled: { rotationX: 38, zoom: 2.7 },
  // Just under the street, looking up and along the pipes.
  underground: { rotationX: -18, zoom: 3.5 },
};

// A phone shows a fraction of that width, and at the wide view its pipe labels pile up, so the 3D
// view comes in closer there. Same width as the phone layout in style.css.
const NARROW_PX = 900;
const NARROW_ANGLED_ZOOM = 3.2;

const presetFor = (preset: Preset, width: number): Partial<OrbitViewState> =>
  preset === 'angled' && width < NARROW_PX
    ? { ...PRESETS.angled, zoom: NARROW_ANGLED_ZOOM }
    : PRESETS[preset];

const INITIAL_VIEW: OrbitViewState = {
  target: [0, 0, 0],
  zoom: 1.6,
  rotationX: 90,
  // North up until a search turns it to the street grid.
  rotationOrbit: 0,
  minRotationX: -80,
  maxRotationX: 90,
  minZoom: 0.5,
  // About 500 px per meter: close enough to make out a service line's curb valve and box.
  maxZoom: 9,
};

// The arrival: the camera drops from a high aerial view, through the street and into the view
// it lands in (under the street, unless the user picked another), while the photo fades and the
// pipes spread outward from the address. Kept short, about a second and a half end to end with
// the spread, so it reads as one move rather than a show to sit through; any touch, scroll or key
// skips to the end.
const DIVE_MS = { first: 1400, again: 1000 };
const REVEAL_MS = 900;
// The pipes start spreading this far into the dive, so the spread ends soon after it lands.
const REVEAL_AT = 0.4;
const REVEAL_REACH_M = 320;
const DRILL_MS = 900;
// Wheel travel past the widest zoom before handing off to the city map; a few mouse notches.
const ZOOM_OUT_PUSH = 120;
const MIN_LABELLED_M = 15;

const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

interface SectionedView {
  inView: Visible;
  roads: Vec2[][][];
  sidewalks: Vec2[][][];
  buildings: SceneBuilding[];
  streets: StreetLabel[];
}

/** What the user can see right now, recomputed only when the data or the layer switches change. */
interface Visible {
  runs: PipeRun[];
  pieces: PipePiece[];
  ticks: PipePiece[];
  joints: Joint[];
  points: ScenePoint[];
  assets: ScenePoint[];
  services: ServiceLine[];
  links: AssetLink[];
  digSpots: DigSpot[];
  workZones: WorkZone[];
}

/**
 * Pipes are drawn oversized, so a shallow one (electric at 0.5 ft) would sit inside the road
 * slab. Drop each just clear of it. Only the drawing moves; labels and the dig check keep the
 * real depth.
 */
const clearOfSlab = <T extends { utility: UtilityKind; depthFt: number; radiusM?: number }>(
  pipe: T,
  stretch: number,
): T => {
  const clearM = SLAB_M + radiusOf(pipe) + UNDER_SLAB_GAP_M;
  const clearFt = clearM / (FEET_TO_METERS * stretch);
  return pipe.depthFt >= clearFt ? pipe : { ...pipe, depthFt: clearFt };
};

const visibleOf = (state: SceneState): Visible => {
  const { data, hidden, stretch } = state;
  const hideRecycled = hidden.has('recycled');
  const runs = data.runs
    .filter((r) => !hidden.has(r.utility) && !(hideRecycled && isRecycled(r.surveyed)))
    .map((r) => clearOfSlab(r, stretch));
  const pieces = data.pieces
    .filter((p) => !hidden.has(p.utility) && !(hideRecycled && p.recycled))
    .map((p) => clearOfSlab(p, stretch));
  const points = data.points.filter((p) =>
    p.kind === 'permit-point' ? !p.utility || !hidden.has(p.utility) : !hidden.has(p.kind),
  );
  return {
    runs,
    pieces,
    ticks: pieces.filter((_, i) => i % TICK_EVERY === 0),
    // A fitting wherever a run starts, bends or ends, like the couplings and elbows on real pipe.
    joints: runs.flatMap((r) =>
      r.path.map((position, i) => ({
        ref: r.ref,
        utility: r.utility,
        position,
        depthFt: r.depthFt,
        neighbors: [r.path[i - 1], r.path[i + 1]].filter((p): p is Vec2 => p !== undefined),
        ...(r.radiusM ? { radiusM: r.radiusM } : {}),
        ...(isRecycled(r.surveyed) ? { recycled: true as const } : {}),
      })),
    ),
    points,
    assets: points.filter((p) => p.kind !== 'permit-point'),
    // From the drawn runs, so electric and telecom manholes reach their pipes below the slab.
    links: linkAssets(points, runs),
    digSpots: hidden.has('dig-spots')
      ? []
      : data.digSpots.filter(
          (spot) => !hidden.has(spot.utility) && issuedSince(spot.issued, state.since),
        ),
    services: data.services.filter((s) =>
      s.utility === 'water'
        ? !hidden.has('services') && !hidden.has('water')
        : !hidden.has('house-sewers') && !hidden.has('sewer'),
    ),
    workZones: hidden.has('work') ? [] : state.workZones,
  };
};

export const createScene = (container: HTMLDivElement, handlers: SceneHandlers) => {
  let state: SceneState | null = null;
  let visible: Visible | null = null;
  let labels: PipeLabel[] = [];
  let viewState: OrbitViewState = INITIAL_VIEW;
  let destination: OrbitViewState = INITIAL_VIEW;
  let hydrant: HydrantMeshes = CODE_HYDRANT;
  // No code-built stand-in: until the model loads, signals keep their pins.
  let signal: SignalMeshes | null = null;
  let palette = scenePalette(currentTheme());
  // Only colors change, so the layers keep their data and just recolor.
  onThemeChange((theme) => {
    palette = scenePalette(theme);
    compose();
  });

  const motion = {
    dive: null as { start: number; duration: number } | null,
    /** Held high over the photo, waiting for the street to load before diving (see `poise`). */
    hold: null as { first: boolean } | null,
    revealStart: null as number | null,
    revealPending: false,
    probeStart: 0,
    probeKey: '',
  };

  const zOf = (depthFt: number) => -depthFt * FEET_TO_METERS * (state?.stretch ?? 6);

  // Orthographic, like a CAD model: parallel lines stay parallel, so pipe spacing reads true.
  // In orthographic mode fovy doesn't change the picture, only how far back the camera sits
  // (0.5 / tan(fovy / 2) screen heights). At the default 50° it is a few meters off the street
  // when zoomed in, and lamp poles poke through it and get cut off; 5° sets it ten times back.
  const orbitView = new OrbitView({
    orbitAxis: 'Z',
    orthographic: true,
    fovy: 5,
    near: 0.1,
    far: 5000,
  });

  const viewportFor = (next: OrbitViewState) =>
    orbitView.makeViewport({
      width: container.clientWidth,
      height: container.clientHeight,
      viewState: next,
    });

  /**
   * Panning slides the orbit center across the screen plane, which in a tilted view lifts it
   * into the air or sinks it underground. Moving it along the line of sight back to street
   * level leaves the picture unchanged (the camera is orthographic) and keeps rotation pivoting
   * on the ground, the way Google Maps feels.
   */
  const toStreetLevel = (next: OrbitViewState): OrbitViewState => {
    // Near the horizon the line of sight barely meets the ground, so the jump would be huge.
    if (Math.abs(next.rotationX ?? 0) < 8) return next;
    const viewport = viewportFor(next);
    if (!viewport) return next;
    const [x, y] = viewport.unproject([container.clientWidth / 2, container.clientHeight / 2], {
      targetZ: 0,
    });
    if (!Number.isFinite(x) || !Number.isFinite(y)) return next;
    return { ...next, target: [x!, y!, 0] };
  };

  /** The street-level point under a screen position. */
  const groundAt = (x: number, y: number): Vec2 | null => {
    const viewport = viewportFor(viewState);
    if (!viewport) return null;
    const [gx, gy] = viewport.unproject([x, y], { targetZ: 0 });
    return Number.isFinite(gx) && Number.isFinite(gy) ? [gx!, gy!] : null;
  };

  /** Screen direction of a ground direction, read off the camera so it can't drift from the picture. */
  const screenAngle = (viewport: ReturnType<typeof viewportFor>, toward: Vec2) => {
    const [cx, cy] = viewState.target;
    const [x0, y0] = viewport!.project([cx!, cy!, 0]);
    const [x1, y1] = viewport!.project([cx! + toward[0] * 50, cy! + toward[1] * 50, 0]);
    return (Math.atan2(x1! - x0!, y0! - y1!) * 180) / Math.PI;
  };

  const readCamera = (): CameraReading | null => {
    const viewport = viewportFor(viewState);
    if (!viewport) return null;
    return {
      north: screenAngle(viewport, [0, 1]),
      east: screenAngle(viewport, [1, 0]),
      below: (viewState.rotationX ?? 0) < 0,
    };
  };

  const reportCamera = () => {
    const reading = readCamera();
    if (reading) handlers.onCamera(reading);
  };

  const refOf = (info: PickingInfo) => (info.object as { ref?: string } | undefined)?.ref ?? null;

  const deck = new Deck<OrbitView>({
    parent: container,
    // A 3x phone screen at full resolution needs drawing and picking buffers over twice the size
    // of 2x, for a difference too fine to see at this size. iPhones kill tabs that run short.
    useDevicePixels: Math.min(window.devicePixelRatio || 1, 2),
    views: orbitView,
    effects: [lighting],
    initialViewState: INITIAL_VIEW,
    // Drag moves the map; right-drag or a held modifier key (Ctrl, Shift, Alt, Cmd) rotates and tilts.
    controller: { inertia: 300, dragMode: 'pan', touchRotate: true },
    getCursor: ({ isDragging, isHovering }) =>
      state?.probing ? 'crosshair' : isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab',
    onViewStateChange: ({ viewState: next, interactionState }) => {
      const grounded = interactionState.isPanning ? { ...next, ...toStreetLevel(next) } : next;
      viewState = grounded;
      // Once the user takes over, their view becomes the base for the next button press.
      if (!interactionState.inTransition) destination = viewState;
      refreshLabels();
      reportCamera();
      // Label layout depends on the camera, so redo it on the next frame.
      if (!frame) frame = requestAnimationFrame(animate);
      return grounded;
    },
    onHover: (info: PickingInfo) => handlers.onHover(refOf(info), info.x, info.y),
    onClick: (info: PickingInfo) => {
      if (!state?.probing) return handlers.onSelect(refOf(info));
      const point = groundAt(info.x, info.y);
      if (point) handlers.onProbe(point);
    },
  });

  // Any touch, click, scroll or key during the dive ends it: the user wants control now. A dive
  // under way jumps to where it was going, so a key press lands rather than freezing mid-air.
  const skipDive = () => {
    if (!motion.dive && !motion.revealPending && !motion.hold) return;
    const diving = motion.dive !== null;
    motion.hold = null;
    motion.dive = null;
    motion.revealPending = false;
    motion.revealStart = -Infinity;
    if (diving) {
      viewState = { ...viewState, ...destination };
      deck.setProps({ initialViewState: { ...viewState } });
    }
    compose();
  };
  container.addEventListener('pointerdown', skipDive, { capture: true });
  container.addEventListener('wheel', skipDive, { capture: true, passive: true });
  window.addEventListener('keydown', (event) => {
    if (!event.metaKey && !event.ctrlKey) skipDive();
  });

  // Scrolling out at the widest zoom keeps going, like a web map, into the city map. It takes a
  // deliberate push, so a trackpad's tail of small scrolls doesn't leave the street.
  let pushedPastLimit = 0;
  container.addEventListener(
    'wheel',
    (event) => {
      const atLimit = (viewState.zoom as number) <= (INITIAL_VIEW.minZoom ?? 0) + 0.02;
      pushedPastLimit = atLimit && event.deltaY > 0 ? pushedPastLimit + event.deltaY : 0;
      if (pushedPastLimit < ZOOM_OUT_PUSH) return;
      pushedPastLimit = 0;
      handlers.onZoomOutPastLimit();
    },
    { passive: true },
  );

  let labelCenter: Vec2 = [0, 0];
  let labelFrame = 0;
  /** Labels follow the view center; recompute only once it has moved a meaningful distance. */
  function refreshLabels() {
    const center: Vec2 = [viewState.target[0], viewState.target[1]];
    if (labelFrame || distance2(center, labelCenter) < 15) return;
    labelFrame = requestAnimationFrame(() => {
      labelFrame = 0;
      labelCenter = center;
      labels = labelsFor(center);
      compose();
    });
  }

  function labelsFor(center: Vec2): PipeLabel[] {
    if (!visible || !state) return [];
    const emphasized = state.emphasizedUtility;
    return (
      visible.runs
        // Corner joins and other stubs are too short to carry a label next to the line.
        .filter(
          (r) =>
            r.path.length > 1 &&
            polylineLength(r.path) >= MIN_LABELLED_M &&
            (emphasized === null || r.utility === emphasized),
        )
        .map((r) => {
          const shift = LABEL_SHIFT_M[r.utility] / (polylineLength(r.path) || 1);
          return { r, at: pointAlong(r.path, nearestFraction(r.path, center) + shift) };
        })
        .filter(({ at }) => distance2(at, center) <= LABEL_RADIUS_M)
        // Repeats are thinned on screen at placement, where it's known which ones fit.
        .sort((a, b) => distance2(a.at, center) - distance2(b.at, center))
        .map(({ r, at }) => {
          const length = polylineLength(r.path) || 1;
          const from = nearestFraction(r.path, at);
          return {
            run: r,
            position: [...at, zOf(r.depthFt)] as Vec3,
            text: pipeLabelText(r),
            alternates: LABEL_ALTERNATE_M.map(
              (meters) => [...pointAlong(r.path, from + meters / length), zOf(r.depthFt)] as Vec3,
            ),
          };
        })
    );
  }

  /** How far from the address the pipes have spread during the dive. Infinity once done. */
  const revealRadius = (now: number) => {
    if (motion.revealStart === null) return motion.revealPending ? 0 : Infinity;
    const t = (now - motion.revealStart) / REVEAL_MS;
    return t >= 1 ? Infinity : easeOut(t) * REVEAL_REACH_M;
  };

  /** Photo opacity during the dive: full while high up, gone by the time the camera levels off. */
  const divePhoto = (now: number) => {
    if (motion.hold) return 1;
    if (!motion.dive) return 0;
    const t = (now - motion.dive.start) / motion.dive.duration;
    return 1 - easeOut((t - 0.35) / 0.55);
  };

  let frame = 0;
  let pulseTimer: ReturnType<typeof setTimeout> | undefined;
  // The layers deck.gl has, by id, and who's waiting for the rest to arrive (staging.ts).
  let committedLayers = new Map<string, Layer>();
  let stagingDone = true;
  const settleWaiters: (() => void)[] = [];
  const animate = () => {
    frame = 0;
    compose();
  };

  // Flow bands move by a time uniform, so they only need the GPU to redraw, not the layers to be
  // rebuilt. About 30 times a second is smooth for something this slow.
  let flowActive = false;
  let flowFrame = 0;
  let flowDrawnAt = 0;
  const flowTick = (now: number) => {
    flowFrame = 0;
    if (!flowActive || document.hidden) return;
    if (now - flowDrawnAt >= FLOW_FRAME_MS) {
      flowDrawnAt = now;
      deck.redraw('flow');
    }
    flowFrame = requestAnimationFrame(flowTick);
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && flowActive && !flowFrame) flowFrame = requestAnimationFrame(flowTick);
  });

  /** Near level, the scene is cut to a thin slice through the view center; null otherwise. */
  const sectionFor = (view: OrbitViewState): Section | null => {
    if (Math.abs(view.rotationX ?? 90) >= SECTION_TILT) return null;
    const viewport = viewportFor(view);
    if (!viewport) return null;
    const [cx, cy] = view.target;
    const [x0] = viewport.project([cx!, cy!, 0]);
    const [xEast] = viewport.project([cx! + 1, cy!, 0]);
    const [xNorth] = viewport.project([cx!, cy! + 1, 0]);
    // The ground direction that moves things across the screen; the line of sight is square to it.
    const across: Vec2 = [xEast! - x0!, xNorth! - x0!];
    const length = Math.hypot(...across);
    if (!length) return null;
    return {
      center: [cx!, cy!],
      depth: [-across[1] / length, across[0] / length],
      halfWidth: SECTION_HALF_WIDTH_M,
    };
  };

  let sectionCache: { key: string; source: Visible; view: SectionedView } | null = null;
  /** What the current slice keeps. Cached, since the camera only settles on a few slices. */
  const sectionedView = (
    source: Visible,
    data: SceneData,
    section: Section | null,
  ): SectionedView => {
    if (!section) {
      return {
        inView: source,
        roads: data.roads,
        sidewalks: data.sidewalks,
        buildings: data.buildings,
        streets: data.labels,
      };
    }
    const key = [
      Math.round(section.center[0]),
      Math.round(section.center[1]),
      Math.round((Math.atan2(section.depth[1], section.depth[0]) * 180) / Math.PI),
    ].join(',');
    if (sectionCache?.key === key && sectionCache.source === source) return sectionCache.view;
    const keep = (point: Vec2) => inSection(point, section);
    const clip = (polygons: Vec2[][][]) =>
      polygons
        .filter((polygon) => crossesSection(polygon[0] ?? [], section))
        .map((polygon) =>
          polygon.map((ring) => clipToSection(ring, section)).filter((ring) => ring.length >= 3),
        )
        .filter((polygon) => polygon.length > 0);
    const points = source.points.filter((p) => keep(p.position));
    const view: SectionedView = {
      inView: {
        runs: source.runs.filter((r) => crossesSection(r.path, section)),
        pieces: source.pieces.filter((p) => crossesSection([p.a, p.b], section)),
        ticks: source.ticks.filter((p) => crossesSection([p.a, p.b], section)),
        joints: source.joints.filter((j) => keep(j.position)),
        points,
        assets: points.filter((p) => p.kind !== 'permit-point'),
        // Every lot along the slice would stack its own line; a section shows only the cut.
        links: source.links.filter((l) => crossesSection([l.from, l.to], section)),
        digSpots: source.digSpots.filter((spot) => keep(spot.position)),
        services: source.services.filter((s) =>
          inSection([(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2], {
            ...section,
            halfWidth: SERVICE_SECTION_HALF_WIDTH_M,
          }),
        ),
        workZones: source.workZones.filter((z) => crossesSection(z.path, section)),
      },
      // Clipped, not just filtered: a cross street kept whole would stick out of the slice at
      // the intersection and turn the slab into a T.
      roads: clip(data.roads),
      // A street section runs building line to building line, and the outer utility lanes sit
      // under the sidewalk.
      sidewalks: clip(data.sidewalks),
      buildings: data.buildings.filter((b) => crossesSection(b.polygon[0] ?? [], section)),
      streets: data.labels.filter((street) =>
        street.paths.some((path) => crossesSection(path, section)),
      ),
    };
    sectionCache = { key, source, view };
    return view;
  };

  // Turning each fixture to face its street searches the curbs: too slow to redo every frame,
  // and it only changes with the data.
  let fixtureCache: {
    assets: ScenePoint[];
    links: AssetLink[];
    curbs: Vec2[][];
    poses: FixturePose[];
  } | null = null;
  const posedFixtures = (assets: ScenePoint[], links: AssetLink[], curbs: Vec2[][]) => {
    if (
      fixtureCache?.assets !== assets ||
      fixtureCache.links !== links ||
      fixtureCache.curbs !== curbs
    )
      fixtureCache = { assets, links, curbs, poses: poseFixtures(assets, links, curbs) };
    return fixtureCache.poses;
  };

  function compose() {
    if (!state || !visible) return;
    const section = sectionFor(viewState);
    const { inView, roads, sidewalks, buildings, streets } = sectionedView(
      visible,
      state.data,
      section,
    );
    const now = performance.now();
    const { data, ground, photo, selectedRef, emphasizedUtility } = state;

    if (motion.dive && now - motion.dive.start > motion.dive.duration) motion.dive = null;
    // The pipes start spreading once they have loaded and the camera is most of the way down.
    if (
      motion.revealPending &&
      !motion.hold &&
      inView.pieces.length &&
      (!motion.dive || now - motion.dive.start > motion.dive.duration * REVEAL_AT)
    ) {
      motion.revealPending = false;
      motion.revealStart = now;
    }
    const radius = revealRadius(now);
    const revealing = radius !== Infinity;
    const pieces = revealing
      ? inView.pieces.filter((p) => Math.hypot(...p.a) <= radius)
      : inView.pieces;
    const joints = revealing
      ? inView.joints.filter((j) => Math.hypot(...j.position) <= radius)
      : inView.joints;
    const services = revealing
      ? inView.services.filter((s) => Math.hypot(...s.a) <= radius)
      : inView.services;
    const waterServices = services.filter((s) => s.utility === 'water');
    const links = revealing
      ? inView.links.filter((l) => Math.hypot(...l.from) <= radius)
      : inView.links;
    flowActive =
      state.motion &&
      !state.hidden.has('flow') &&
      (services.length > 0 ||
        links.some((link) => link.kind === 'catch-basin') ||
        pieces.some((piece) => piece.flow));
    if (flowActive && !flowFrame) flowFrame = requestAnimationFrame(flowTick);
    const curbValves = waterServices.filter((s) => s.curbValve);

    // Without loaded tiles there is no photo to fade, so the plan shows from the start.
    const photoOpacity = !photo.length ? 0 : ground === 'photo' ? 1 : divePhoto(now);
    const probeProgress = state.probe
      ? state.motion
        ? easeOut((now - motion.probeStart) / DRILL_MS)
        : 1
      : 1;

    const viewport = viewportFor(viewState);
    const project = (point: Vec3): [number, number] | null => {
      if (!viewport) return null;
      const [px, py] = viewport.project(point);
      return Number.isFinite(px) && Number.isFinite(py) ? [px!, py!] : null;
    };
    // A tag cut off by the edge of the screen is worse than one moved along its line.
    const screenBox = (position: Vec3, lift: number, text: string) => {
      const at = project(position);
      if (!at) return null;
      const box = labelBox(at[0], at[1] - lift, text);
      const onScreen =
        box.x0 >= 0 &&
        box.y0 >= 0 &&
        box.x1 <= container.clientWidth &&
        box.y1 <= container.clientHeight;
      return onScreen ? box : null;
    };

    // 0 looking down from well above, 1 from street level or below.
    const lowness = Math.min(
      1,
      Math.max(
        0,
        (LOW_TILT_START - (viewState.rotationX ?? 90)) / (LOW_TILT_START - LOW_TILT_FULL),
      ),
    );
    const center: Vec2 = [viewState.target[0], viewState.target[1]];
    const closeness = Math.min(
      1,
      Math.max(
        0,
        (viewState.zoom - STREET_TAGS_ZOOM_START) /
          (STREET_TAGS_ZOOM_FULL - STREET_TAGS_ZOOM_START),
      ),
    );
    // 0 when the painted names say it all, 1 when the tags have taken over.
    const tagging = Math.max(lowness, closeness);
    const streetTags =
      tagging > 0.5 ? streetTagsNear(streets, center, 1 / 2 ** viewState.zoom) : [];

    // The address tag claims its space first, then the street tags, then the pipe labels.
    const addressAt = state.address ? project([...state.address.position, ADDRESS_TAG_M]) : null;
    const reserved = [
      ...handlers.obstacles(),
      ...(addressAt && state.address
        ? [labelBox(addressAt[0], addressAt[1], state.address.label)]
        : []),
    ];
    const placedStreetTags = placeFirstFit(
      streetTags,
      (tag) =>
        tag.spots.map((spot) =>
          section && !inSection(spot, section)
            ? null
            : screenBox([spot[0], spot[1], 0], 0, tag.text),
        ),
      reserved,
    ).map(({ item, choice }) => {
      const spot = item.spots[choice]!;
      reserved.push(screenBox([spot[0], spot[1], 0], 0, item.text)!);
      return { text: item.text, position: spot };
    });
    // Labels arrive closest to the view center first, so when two collide the nearer one wins.
    const spotsOf = (label: PipeLabel): Vec3[] => {
      const spots = [label.position, ...label.alternates];
      // Seen end-on in a section, a pipe is one ring: the tag goes on the ring.
      const crossing = section && crossingOf(label.run.path, section);
      return crossing ? [[crossing[0], crossing[1], label.position[2]], ...spots] : spots;
    };
    const placedLabels = placeFirstFit(
      labels,
      (label) =>
        // Every spot along the pipe on the first row, then the same spots a row higher.
        PIPE_LABEL_ROWS_PX.flatMap((lift) =>
          spotsOf(label).map((position) =>
            section && !inSection([position[0], position[1]], section)
              ? null
              : screenBox(position, lift, label.text),
          ),
        ),
      reserved,
      // Parallel runs and crossing streets would each repeat "Water, 3 ft 5 in"; one per
      // stretch of screen is enough.
      {
        keyOf: (label) => label.text,
        gap: Math.min(SAME_LABEL_GAP_PX, container.clientWidth * 0.3),
      },
    ).map(({ item, choice }) => {
      const spots = spotsOf(item);
      return {
        ...item,
        position: spots[choice % spots.length]!,
        lift: PIPE_LABEL_ROWS_PX[Math.floor(choice / spots.length)]!,
      };
    });

    // In a section, a dimension line from the underside of the road to the top of each tagged
    // pipe, with ticks at both ends like a drawing, so the gap reads at a glance.
    const dimensions = section
      ? placedLabels.flatMap(({ position, run, text }) => {
          // A unit ground vector that points right on screen, and how many meters a pixel is.
          const across: Vec2 = [section.depth[1], -section.depth[0]];
          const ahead = project([position[0] + across[0], position[1] + across[1], position[2]]);
          const here = project(position);
          const sign = ahead && here && ahead[0] < here[0] ? -1 : 1;
          const metersPerPixel = 1 / 2 ** viewState.zoom;
          // Just left of the tag, so the tag doesn't cover it on shallow pipes.
          const shift = -(labelBox(0, 0, text).x1 + DIMENSION_GAP_PX) * metersPerPixel * sign;
          const [x, y] = [position[0] + across[0] * shift, position[1] + across[1] * shift];
          const [tx, ty] = [across[0] * DIMENSION_TICK_M, across[1] * DIMENSION_TICK_M];
          const top = position[2] + radiusOf(run);
          // Too short to read as a line; the ticks alone would look like a stray glyph.
          const [upper, lower] = [project([x, y, -SLAB_M]), project([x, y, top])];
          if (!upper || !lower || lower[1] - upper[1] < DIMENSION_MIN_PX) return [];
          const tick = (height: number) => ({
            from: [x - tx, y - ty, height] as Vec3,
            to: [x + tx, y + ty, height] as Vec3,
            run,
          });
          return [
            { from: [x, y, -SLAB_M] as Vec3, to: [x, y, top] as Vec3, run },
            tick(-SLAB_M),
            tick(top),
          ];
        })
      : [];

    const faded = (utility: UtilityKind | null) =>
      emphasizedUtility !== null && utility !== emphasizedUtility;
    const pipeColor = (d: { utility: UtilityKind }, alpha = 255): Rgba =>
      colorOf(d.utility, faded(d.utility) ? Math.round(alpha * 0.18) : alpha);
    const triggers = [emphasizedUtility, state.stretch, palette.theme];
    const edge = (utility: UtilityKind | null, alpha = 255) => edgeIn(palette, utility, alpha);
    const closeUp = viewState.zoom >= MODELS_ONLY_ZOOM;
    const detail = detailForZoom(viewState.zoom as number);
    const posed = posedFixtures(inView.assets, inView.links, data.curbs).filter(
      (fixture) => fixture.kind !== 'traffic-signal' || signal,
    );
    // Up close the models take over from the pins, except for things with no model to stand in.
    const modeled = closeUp ? new Set(posed.map((fixture) => fixture.ref)) : null;
    const roomForAll = viewState.zoom >= CROWDED_PIN_ZOOM;
    const pinned = inView.assets.filter(
      (point) =>
        !modeled?.has(point.ref) &&
        (roomForAll || !CROWDED_KINDS.has(point.kind) || point.ref === selectedRef),
    );
    const fixtures = revealing
      ? posed.filter((fixture) => Math.hypot(...fixture.position) <= radius)
      : posed;

    const wanted = [
      photoOpacity > 0 &&
        photo.map(
          (tile, i) =>
            new BitmapLayer({
              id: `photo-${i}`,
              image: tile.image,
              bounds: tile.bounds,
              opacity: photoOpacity,
              tintColor: palette.photoTint,
              parameters: { depthWriteEnabled: false },
            }),
        ),
      new SolidPolygonLayer<Vec2[][]>({
        id: 'roads',
        data: ground === 'plan' ? roads : [],
        getPolygon: (d) => d,
        getFillColor: palette.road,
        opacity: (1 - photoOpacity) * (1 - lowness),
        parameters: { depthWriteEnabled: false },
      }),
      new PathLayer<Vec2[]>({
        id: 'curbs',
        data: data.curbs,
        getPath: (d) => d,
        getColor: palette.curb,
        widthUnits: 'pixels',
        getWidth: 1.25,
        parameters: { depthWriteEnabled: false },
      }),
      new TextLayer({
        id: 'street-names',
        data: data.labels,
        getPosition: (d) => [d.position[0], d.position[1], 0.1],
        getText: (d) => d.text,
        getAngle: (d) => d.angle,
        billboard: false,
        sizeUnits: 'meters',
        getSize: 3.2,
        getColor: palette.label,
        // Painted on the road, these read mirrored from below; the street tags take over there.
        opacity: 1 - tagging,
        fontFamily: FONT,
        fontWeight: 600,
        characterSet: 'auto',
        parameters: { depthWriteEnabled: false },
      }),
      // Over the photo the real roofs are there already; white blocks would hide them.
      // Extruded polygon layers ask the GPU for (count - 1) sides, so an empty one draws -1 and
      // logs "primcount < 0" every frame. These three hide instead of emptying, which also keeps
      // their geometry built for when they come back.
      new SolidPolygonLayer<SceneBuilding>({
        id: 'buildings',
        data: buildings,
        visible: ground !== 'photo' && buildings.length > 0,
        extruded: true,
        getPolygon: (d) => d.polygon,
        getElevation: massingHeight,
        getFillColor: palette.building,
        material: palette.theme === 'dark' ? DARK_MASSING_MATERIAL : MASSING_MATERIAL,
      }),
      new PathLayer<SceneBuilding>({
        id: 'building-edges',
        data: ground === 'photo' ? [] : buildings,
        getPath: (d) =>
          (d.polygon[0] ?? []).map(([x, y]) => [x, y, massingHeight(d) + 0.02] as Vec3),
        getColor: palette.buildingEdge,
        widthUnits: 'pixels',
        getWidth: 1,
      }),
      // Seen side-on a flat road vanishes, so from low angles it becomes a slab. Drawn after the
      // buildings so the ones behind it don't paint over it, and before the pipes so the shallow
      // ones stay bright inside it.
      new SolidPolygonLayer<Vec2[][]>({
        id: 'road-slab',
        data: roads,
        visible: lowness > 0 && roads.length > 0,
        extruded: true,
        getPolygon: (d) => d.map((ring) => ring.map(([x, y]) => [x, y, -SLAB_M] as Vec3)),
        getElevation: SLAB_M,
        getFillColor: palette.roadAbove,
        opacity: lowness,
        material: false,
        parameters: { depthWriteEnabled: false },
      }),
      new SolidPolygonLayer<Vec2[][]>({
        id: 'sidewalk-slab',
        data: sidewalks,
        visible: lowness > 0 && sidewalks.length > 0,
        extruded: true,
        getPolygon: (d) => d.map((ring) => ring.map(([x, y]) => [x, y, -SLAB_M] as Vec3)),
        getElevation: SLAB_M,
        getFillColor: palette.sidewalkAbove,
        opacity: lowness,
        material: false,
        parameters: { depthWriteEnabled: false },
      }),
      // Where each pipe runs, traced on the street right above it.
      new LineLayer<PipePiece>({
        id: 'surface-traces',
        data: revealing ? [] : inView.pieces,
        // From the side the slab shows where the street is, so traces and ticks are just noise.
        opacity: 1 - lowness,
        getSourcePosition: (d) => [d.a[0], d.a[1], 0.05],
        getTargetPosition: (d) => [d.b[0], d.b[1], 0.05],
        getColor: (d) => pipeColor(d, 120),
        widthUnits: 'pixels',
        getWidth: 1,
        parameters: { depthWriteEnabled: false },
        updateTriggers: { getColor: triggers },
      }),
      // Ticks tie the surface trace to the pipe, so depth reads from any angle.
      new LineLayer<PipePiece>({
        id: 'depth-ticks',
        data: revealing ? [] : inView.ticks,
        opacity: 1 - lowness,
        getSourcePosition: (d) => [d.a[0], d.a[1], 0],
        getTargetPosition: (d) => [d.a[0], d.a[1], zOf(d.depthFt)],
        getColor: (d) => pipeColor(d, 150),
        getWidth: 1,
        updateTriggers: { getColor: triggers, getTargetPosition: triggers },
      }),
      ...tubeLayers({
        pieces,
        joints,
        selected: pieces.filter((p) => p.ref === selectedRef),
        zOf,
        bodyColor: (pipe) => pipeColorOf(pipe, faded(pipe.utility) ? 40 : 255),
        assumedToward: palette.assumedToward,
        selectedColor: [palette.ink[0], palette.ink[1], palette.ink[2], 70],
        fittingColor: (pipe) => pipeTintOf(pipe, 0.28, faded(pipe.utility) ? 40 : 255),
        glassColor: (u) => tintOf(u, 0.3, faded(u) ? 30 : 140),
        triggers,
        flowEnabled: flowActive,
        detail,
      }),
      ...serviceLayers(services, zOf, (u) => colorOf(u, faded(u) ? 40 : 255), triggers, flowActive),
      // Where each service line meets the lot, a stem up to a marker that says what it's made of.
      new LineLayer<ServiceLine>({
        id: 'service-risers',
        data: waterServices,
        getSourcePosition: (d) => [d.b[0], d.b[1], 0],
        getTargetPosition: (d) => [d.b[0], d.b[1], zOf(d.depthFt)],
        getColor: colorOf('water', faded('water') ? 40 : 160),
        getWidth: 1,
        updateTriggers: { getColor: triggers, getTargetPosition: triggers },
      }),
      // The curb valve's extension box comes up flush with the sidewalk.
      new LineLayer<ServiceLine>({
        id: 'curb-valve-stems',
        data: curbValves,
        getSourcePosition: (d) => [d.curbValve![0], d.curbValve![1], 0],
        getTargetPosition: (d) => [d.curbValve![0], d.curbValve![1], zOf(d.depthFt)],
        getColor: edge('water', faded('water') ? 40 : 200),
        getWidth: 1.5,
        updateTriggers: { getColor: triggers, getTargetPosition: triggers },
      }),
      new ScatterplotLayer<ServiceLine>({
        id: 'curb-valve-boxes',
        data: curbValves,
        pickable: true,
        billboard: true,
        radiusUnits: 'pixels',
        getPosition: (d) => [d.curbValve![0], d.curbValve![1], 0.1],
        getRadius: 2.5,
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 1,
        getLineColor: palette.halo,
        getFillColor: edge('water'),
        opacity: faded('water') ? 0.25 : 1,
      }),
      new ScatterplotLayer<ServiceLine>({
        id: 'service-markers',
        data: waterServices,
        pickable: true,
        billboard: true,
        radiusUnits: 'pixels',
        getPosition: (d) => [d.b[0], d.b[1], 0.1],
        getRadius: (d) => (d.ref === selectedRef ? 5.5 : 4),
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: (d) => (d.ref === selectedRef ? 3 : 1.5),
        getLineColor: (d) => serviceMarker(d.lot.material, palette).line,
        getFillColor: (d) => serviceMarker(d.lot.material, palette).fill,
        opacity: faded('water') ? 0.25 : 1,
        updateTriggers: {
          getRadius: selectedRef,
          getLineWidth: selectedRef,
          getLineColor: palette.theme,
          getFillColor: palette.theme,
        },
      }),
      // Hydrants, catch basins and manholes are surveyed; how they reach the main is inferred.
      ...assetLinkLayers(
        links,
        zOf,
        (u) => colorOf(u, faded(u) ? 40 : 255),
        (u) => tintOf(u, 0.35, faded(u) ? 40 : 255),
        triggers,
        flowActive,
      ),
      ...fixtureLayers(
        fixtures,
        zOf,
        {
          iron: IRON,
          hydrantBody: HYDRANT_SILVER,
          galvanized: GALVANIZED,
          lampLens: LAMP_LENS_WARM,
          stainless: STAINLESS,
          screen: SCREEN_BLACK,
          trim: () => colorOf('water', faded('water') ? 60 : 255),
          chamber: () => (faded('sewer') ? [176, 172, 164, 60] : PRECAST_CONCRETE),
        },
        triggers,
        hydrant,
        signal,
      ),
      // Painted on the street the way crews mark a dig, in the utility's APWA color. It writes
      // depth like the street would, so from above it covers the pipes and from below they cover it.
      new LineLayer<{ spot: DigSpot; from: Vec3; to: Vec3 }>({
        id: 'dig-spots',
        data: (revealing ? [] : inView.digSpots).flatMap((spot) =>
          [
            [1, 1],
            [1, -1],
          ].map(([dx, dy]) => ({
            spot,
            ref: spot.ref,
            from: [
              spot.position[0] - dx! * DIG_MARK_M,
              spot.position[1] - dy! * DIG_MARK_M,
              0.06,
            ] as Vec3,
            to: [
              spot.position[0] + dx! * DIG_MARK_M,
              spot.position[1] + dy! * DIG_MARK_M,
              0.06,
            ] as Vec3,
          })),
        ),
        pickable: true,
        getSourcePosition: (d) => d.from,
        getTargetPosition: (d) => d.to,
        getColor: (d) => colorOf(d.spot.utility, faded(d.spot.utility) ? 50 : 255),
        widthUnits: 'pixels',
        getWidth: 4,
        updateTriggers: { getColor: triggers },
      }),
      // A manhole sits over its line, so the cover is a better clue to where the line runs than
      // the drawn lane; this marks the gap between the two.
      new LineLayer<AssetLink>({
        id: 'manhole-offsets',
        data: links.filter((l) => l.kind === 'manhole'),
        getSourcePosition: (d) => [d.from[0], d.from[1], zOf(d.depthFt)],
        getTargetPosition: (d) => [d.to[0], d.to[1], zOf(d.depthFt)],
        getColor: (d) => edge(d.utility, faded(d.utility) ? 40 : 200),
        getWidth: 1,
        updateTriggers: {
          getColor: triggers,
          getSourcePosition: triggers,
          getTargetPosition: triggers,
        },
      }),
      // Permit points are pipes, in their utility's color; street features are all one
      // neutral, with a rim in the utility's color when they're part of its network.
      new ScatterplotLayer<ScenePoint>({
        id: 'markers',
        data: closeUp ? inView.points.filter((p) => p.kind === 'permit-point') : inView.points,
        pickable: true,
        billboard: true,
        radiusUnits: 'pixels',
        getPosition: (d) =>
          d.kind === 'permit-point'
            ? [d.position[0], d.position[1], zOf(d.depthFt ?? 0)]
            : [d.position[0], d.position[1], 0.1],
        getRadius: (d) => (d.kind === 'permit-point' || !ringOf(d) ? 3.5 : 4),
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: (d) =>
          d.ref === selectedRef ? 3 : d.kind !== 'permit-point' && ringOf(d) ? 2 : 1.5,
        getLineColor: (d) => {
          if (d.ref === selectedRef) return palette.ink;
          if (d.kind === 'permit-point') return palette.halo;
          const ring = ringOf(d);
          return ring ? colorOf(ring, faded(ring) ? 60 : 255) : palette.halo;
        },
        getFillColor: (d) =>
          d.kind === 'permit-point'
            ? colorOf(d.utility, faded(d.utility) ? 60 : 255)
            : withAlpha(palette.feature, emphasizedUtility !== null ? 90 : 255),
        updateTriggers: {
          getFillColor: triggers,
          getLineColor: [selectedRef, ...triggers],
          getLineWidth: selectedRef,
          getPosition: triggers,
        },
      }),
      new LineLayer<ScenePoint>({
        id: 'pin-stems',
        data: pinned,
        getSourcePosition: (d) => [d.position[0], d.position[1], 0],
        getTargetPosition: (d) => [d.position[0], d.position[1], PIN_LIFT_M],
        getColor: () =>
          withAlpha(palette.featureStem, emphasizedUtility !== null ? 40 : palette.featureStem[3]),
        getWidth: 1.5,
        updateTriggers: { getColor: triggers },
      }),
      new IconLayer<ScenePoint>({
        id: 'pins',
        data: pinned,
        pickable: true,
        getPosition: (d) => [d.position[0], d.position[1], PIN_LIFT_M],
        getIcon: (d) => {
          const selected = d.ref === selectedRef;
          const ring = ringOf(d);
          return pinIcon(
            d.kind as AssetKind,
            selected ? palette.inkHex : palette.featureHex,
            selected ? palette.onInkHex : palette.onFeatureHex,
            // The halo: white on the light ground, the ground itself on dark.
            palette.onInkHex,
            ring ? hexOf(ring) : null,
          );
        },
        getSize: (d) => (d.ref === selectedRef ? 36 : 28),
        getColor: (d) => [
          255,
          255,
          255,
          emphasizedUtility !== null && ringOf(d) !== emphasizedUtility ? 90 : 255,
        ],
        // Pins sit above everything, the way a marker does on a map.
        parameters: { depthCompare: 'always' },
        updateTriggers: {
          getIcon: [selectedRef, palette.theme],
          getSize: selectedRef,
          getColor: triggers,
        },
      }),
      ...workZoneLayers(inView.workZones, now, state.motion, palette),
      state.probe && probeLayers(state.probe, probeProgress, zOf, project, palette),
      new LineLayer<{ from: Vec3; to: Vec3; run: PipeRun }>({
        id: 'dimensions',
        data: dimensions,
        getSourcePosition: (d) => d.from,
        getTargetPosition: (d) => d.to,
        getColor: (d) => edge(d.run.utility),
        widthUnits: 'pixels',
        getWidth: 1.5,
        updateTriggers: { getColor: palette.theme },
        parameters: { depthCompare: 'always' },
      }),
      new TextLayer<PipeLabel & { lift: number }>({
        id: 'pipe-labels',
        data: revealing || state.probe ? [] : placedLabels,
        getPosition: (d) => d.position,
        getText: (d) => d.text,
        getSize: 12,
        getColor: (d) => inkRgb(d.run.utility),
        getAlignmentBaseline: 'bottom',
        // Clear the top of the tube.
        getPixelOffset: (d) => [0, -d.lift],
        background: true,
        getBackgroundColor: (d) => pipeColorOf(labelPipe(d.run)),
        // A darker edge in the same hue keeps pale tags (steam) readable on the light ground.
        getBorderColor: (d) => pipeEdgeOf(labelPipe(d.run)),
        getBorderWidth: 1,
        backgroundPadding: [6, 3],
        backgroundBorderRadius: 4,
        fontFamily: FONT,
        fontWeight: 700,
        characterSet: 'auto',
        parameters: { depthCompare: 'always' },
      }),
      new TextLayer<{ text: string; position: Vec2 }>({
        id: 'street-tags',
        data: placedStreetTags,
        getPosition: (d) => [d.position[0], d.position[1], 0],
        getText: (d) => d.text,
        getSize: 12,
        getColor: palette.streetTagText,
        getAlignmentBaseline: 'bottom',
        background: true,
        getBackgroundColor: palette.streetTagBackground,
        backgroundPadding: [6, 3],
        backgroundBorderRadius: 4,
        fontFamily: FONT,
        fontWeight: 600,
        characterSet: 'auto',
        parameters: { depthCompare: 'always' },
      }),
      state.address &&
        new LineLayer<{ label: string; position: Vec2 }>({
          id: 'address-pin',
          data: [state.address],
          getSourcePosition: (d) => [d.position[0], d.position[1], 0],
          getTargetPosition: (d) => [d.position[0], d.position[1], ADDRESS_TAG_M],
          getColor: palette.addressStem,
          getWidth: 1.5,
          parameters: { depthCompare: 'always' },
        }),
      state.address &&
        new TextLayer<{ label: string; position: Vec2 }>({
          id: 'address-label',
          data: [state.address],
          getPosition: (d) => [d.position[0], d.position[1], ADDRESS_TAG_M],
          getText: (d) => d.label,
          getSize: 13,
          // Ink, not yellow: on this map yellow only ever means gas or steam.
          getColor: palette.onInk,
          getAlignmentBaseline: 'bottom',
          background: true,
          getBackgroundColor: palette.ink,
          backgroundPadding: [6, 3],
          backgroundBorderRadius: 4,
          fontFamily: FONT,
          fontWeight: 700,
          characterSet: 'auto',
          parameters: { depthCompare: 'always' },
        }),
    ]
      .flat()
      .flatMap((layer) => (layer ? [(layer as Layer).clone({ dataComparator: sameItems })] : []));
    const staged = stageLayers(wanted, committedLayers, sameItems, undefined, stagePriority);
    committedLayers = staged.committed;
    deck.setProps({ layers: staged.layers });
    // The rest of the layers come on over the next frames, each its own task.
    if (staged.deferred && !frame) frame = requestAnimationFrame(animate);
    if (!staged.deferred && settleWaiters.length)
      // Resolved after the browser has drawn this frame, the one with every layer on.
      requestAnimationFrame(() => settleWaiters.splice(0).forEach((resolve) => resolve()));
    stagingDone = !staged.deferred;

    const moving = revealing || motion.dive !== null || probeProgress < 1;
    const pulsing = state.motion && inView.workZones.length > 0;
    if (moving && !frame) frame = requestAnimationFrame(animate);
    // Active work pulses slowly, and a compose remakes labels, filters and fixtures: at every
    // frame that was gigabytes of garbage a minute, enough for an iPhone to kill the tab.
    else if (pulsing && !frame && !pulseTimer)
      pulseTimer = setTimeout(() => {
        pulseTimer = undefined;
        if (!frame) frame = requestAnimationFrame(animate);
      }, PULSE_FRAME_MS);
  }

  const update = (next: SceneState) => {
    const previous = state;
    state = next;
    if (
      !previous ||
      previous.data !== next.data ||
      previous.hidden !== next.hidden ||
      previous.stretch !== next.stretch ||
      previous.workZones !== next.workZones
    ) {
      visible = visibleOf(next);
    }
    const probeKey = next.probe ? `${next.probe.position.join(',')}|${next.probe.depthFt}` : '';
    if (probeKey !== motion.probeKey) {
      motion.probeKey = probeKey;
      motion.probeStart = performance.now();
    }
    labels = labelsFor([viewState.target[0], viewState.target[1]]);
    compose();
  };

  // Every camera move heads toward one destination, so a new move redirects the current
  // flight instead of freezing it halfway.
  const transitionTo = (
    partial: Partial<OrbitViewState>,
    duration: number,
    easing: (t: number) => number = (t) => t,
  ) => {
    destination = { ...destination, ...partial };
    deck.setProps({
      initialViewState: {
        ...viewState,
        ...destination,
        transitionDuration: duration,
        transitionEasing: easing,
        transitionInterpolator: new LinearInterpolator({
          transitionProps: ['rotationX', 'rotationOrbit', 'zoom', 'target'],
        }),
      },
    });
    // A jump has no frames in between, so deck.gl never reports the new view; without this the
    // labels, the street-side readout and the link would all stay on the old one.
    if (duration === 0) {
      viewState = { ...viewState, ...destination };
      refreshLabels();
      reportCamera();
    }
  };

  const goTo = (preset: Preset, duration = 900) => transitionTo(presetFor(preset, container.clientWidth), duration);

  const poseView = ({ target, zoom, tilt, bearing }: CameraPose): Partial<OrbitViewState> => ({
    target: [target[0], target[1], 0],
    zoom: Math.min(Math.max(zoom, INITIAL_VIEW.minZoom ?? 0), INITIAL_VIEW.maxZoom ?? 20),
    rotationX: Math.min(Math.max(tilt, INITIAL_VIEW.minRotationX ?? -90), 90),
    rotationOrbit: bearing,
  });

  /**
   * Puts the camera high over `target`, turned to `bearing` (see `gridBearing`), where a dive
   * starts, and holds it there over the aerial photo. The first draw of a street compiles every
   * layer's shaders, which stalls the page for seconds; holding still through that, then diving
   * once, looks like one smooth move instead of a dive that stops and starts again.
   */
  const poise = (target: Vec2, options: { first: boolean; bearing?: number }) => {
    viewState = {
      ...INITIAL_VIEW,
      target: [target[0], target[1], 0],
      zoom: options.first ? 0.7 : 1.6,
      rotationOrbit: options.bearing ?? 0,
    };
    destination = viewState;
    deck.setProps({ initialViewState: { ...viewState } });
    motion.dive = null;
    motion.hold = { first: options.first };
    motion.revealPending = true;
    motion.revealStart = null;
    compose();
  };

  /**
   * Dives from the held pose down to `target` in the `preset` view, or to `to` (a shared link's
   * camera, which is never animated past). False when there's no hold to dive from: the user took
   * the camera meanwhile.
   */
  const descend = (
    target: Vec2,
    options: { motion: boolean; to?: CameraPose; preset?: Preset },
  ): boolean => {
    const held = motion.hold;
    if (!held) return false;
    motion.hold = null;
    const duration = held.first ? DIVE_MS.first : DIVE_MS.again;
    const landing: Partial<OrbitViewState> = options.to
      ? poseView(options.to)
      : { ...presetFor(options.preset ?? 'underground', container.clientWidth), target: [target[0], target[1], 0] };
    if (!options.motion) {
      motion.revealPending = false;
      motion.revealStart = -Infinity;
      transitionTo(landing, 0);
      compose();
      return true;
    }
    motion.dive = { start: performance.now(), duration };
    transitionTo(landing, duration, easeInOut);
    compose();
    return true;
  };

  /** Where the camera is headed, so a link copied mid-flight still lands where the user meant. */
  const pose = (): CameraPose => ({
    target: [destination.target[0] ?? 0, destination.target[1] ?? 0],
    zoom: destination.zoom as number,
    tilt: destination.rotationX ?? 90,
    bearing: destination.rotationOrbit ?? 0,
  });

  /** Turns the map so north points up the screen, keeping the tilt. */
  const northUp = () => {
    // From above, north is up at every whole turn. From below, the far side of the street sits
    // low on screen, so it takes a half turn more. The nearest one spins the short way.
    const offset = (destination.rotationX ?? 0) < 0 ? 180 : 0;
    const orbit = destination.rotationOrbit ?? 0;
    transitionTo({ rotationOrbit: Math.round((orbit - offset) / 360) * 360 + offset }, 500);
  };

  const rotate = (degrees: number) =>
    transitionTo({ rotationOrbit: (destination.rotationOrbit ?? 0) + degrees }, 350);

  /** Moves the orbit center to a point at street level. */
  const focusOn = (point: Vec2, duration = 800) =>
    transitionTo({ target: [point[0], point[1], 0] }, duration);

  /**
   * A side view from just below street level. In an orthographic camera that puts everything
   * above ground (buildings) higher on screen than everything below it, so nothing hides the shaft.
   */
  const lookAtDig = (point: Vec2) =>
    transitionTo({ target: [point[0], point[1], 0], rotationX: -6, zoom: 4.4 }, 900);

  /** The point the camera orbits, at street level. */
  /** How long until the dive lands, in ms; 0 when there's no dive under way. */
  const diveRemaining = () =>
    motion.dive ? Math.max(0, motion.dive.start + motion.dive.duration - performance.now()) : 0;

  const center = (): Vec2 => [viewState.target[0] ?? 0, viewState.target[1] ?? 0];
  const zoom = () => viewState.zoom as number;

  /** About how far from the orbit center the screen reaches, in meters. */
  const viewRadius = () => {
    const flat = Math.hypot(container.clientWidth, container.clientHeight) / 2 / 2 ** zoom();
    // Tilted, the far side of the screen looks a good way further out.
    return (viewState.rotationX ?? 90) < 75 ? flat * 1.6 : flat;
  };

  /**
   * Levels the camera to straight down at its widest zoom, how the city map looks where it takes
   * over, keeping the way it's turned. Resolves when the camera is there.
   */
  const flatten = (msPerStep: number) => {
    const widest = INITIAL_VIEW.minZoom ?? 0;
    // Further to go takes longer: a quarter turn of tilt or one zoom level is one step.
    const steps =
      Math.abs(90 - (viewState.rotationX ?? 0)) / 90 +
      Math.abs((viewState.zoom as number) - widest);
    const duration = Math.round(Math.min(steps, 3) * msPerStep);
    if (duration > 0) transitionTo({ rotationX: 90, zoom: widest }, duration, easeInOut);
    return new Promise<void>((resolve) => setTimeout(resolve, duration));
  };

  /**
   * Which way the camera is turned, as a map bearing: degrees clockwise from north to screen up.
   * Straight down, north sits at minus the orbit on screen, just as it does at a MapLibre bearing.
   */
  const bearing = () => destination.rotationOrbit ?? 0;

  /** Puts the camera straight down over `target` at `atZoom` and `atBearing`, where the city map left off. */
  const holdAbove = (target: Vec2, atZoom: number, atBearing = 0) => {
    motion.dive = null;
    motion.revealPending = false;
    motion.revealStart = -Infinity;
    viewState = {
      ...viewState,
      target: [target[0], target[1], 0],
      zoom: Math.max(atZoom, INITIAL_VIEW.minZoom ?? 0),
      rotationX: 90,
      rotationOrbit: atBearing,
    };
    destination = viewState;
    deck.setProps({ initialViewState: { ...viewState } });
    compose();
  };

  /** From straight down, tips into a preset view while zooming in, like coming in to land. */
  const land = (duration: number, preset: Preset = 'angled') =>
    transitionTo(presetFor(preset, container.clientWidth), duration, easeInOut);

  /**
   * Resolves once every layer is on the map and drawn. The first full draw is staged over
   * several frames (staging.ts), and the dive waits for it rather than flying through it.
   */
  const whenSettled = () =>
    stagingDone && !frame
      ? Promise.resolve()
      : new Promise<void>((resolve) => settleWaiters.push(resolve));

  const setHydrant = (meshes: HydrantMeshes) => {
    hydrant = meshes;
    compose();
  };

  const setSignal = (meshes: SignalMeshes) => {
    signal = meshes;
    compose();
  };

  return {
    update,
    whenSettled,
    setHydrant,
    setSignal,
    goTo,
    poise,
    descend,
    rotate,
    northUp,
    focusOn,
    lookAtDig,
    reportCamera,
    pose,
    diveRemaining,
    center,
    zoom,
    viewRadius,
    bearing,
    flatten,
    holdAbove,
    land,
    deck,
  };
};
