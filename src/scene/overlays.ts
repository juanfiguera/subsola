import { IconLayer, LineLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { formatFeet } from '../depth';
import { UTILITY_STYLES, type UtilityKind } from '../utilities';
import type { Reach } from '../dig';
import { FONT, INK, WHITE, colorOf, inkRgb } from './colors';
import { scenePalette, type ScenePalette } from './palette';
import { segmentMatrix, tubeMesh } from './meshes';
import { pinIcon } from './pins';
import { offsetPolyline, type Vec2, type Vec3 } from './local';
import { stackOffsets } from './declutter';

export interface WorkZone {
  /** Same ref as the permit block, so clicking opens that block's records. */
  ref: string;
  path: Vec2[];
  position: Vec2;
}

export interface ProbeView {
  position: Vec2;
  depthFt: number;
  hits: { utility: UtilityKind; depthFt: number; reach: Reach }[];
}

const PULSE_MS = 1600;
const BAND_HALF_WIDTH_M = 3.4;
const WORK_PIN_LIFT_M = 4;
const SHAFT_RADIUS_M = 0.9;
const TUBE = tubeMesh();
// Mostly diffuse, so the white shaft picks up shaded sides and stands out from the light scene.
const SHAFT_GLASS = {
  ambient: 0.35,
  diffuse: 0.75,
  shininess: 40,
  specularColor: [255, 255, 255] as Vec3,
};

/**
 * Live work: a band on the block, a ring that keeps pulsing outward, and a cone pin. White with
 * dark edges, because APWA white marks excavation, and yellow would read as a gas line. The band
 * and pin stay white with dark edges in dark mode too; the pulse and stem, drawn on the ground
 * itself, take the palette's ink so they show on either.
 */
export const workZoneLayers = (
  zones: WorkZone[],
  now: number,
  motion: boolean,
  palette: ScenePalette = scenePalette('light'),
) => {
  // Without motion the ring holds still partway out, so the marker still reads as a zone.
  const phase = motion ? (now % PULSE_MS) / PULSE_MS : 0.35;
  return [
    // Two thin edges rather than a dark band underneath, which would gray out the white fill.
    new PathLayer<Vec2[]>({
      id: 'work-band-edges',
      data: zones.flatMap((d) =>
        d.path.length > 1
          ? [offsetPolyline(d.path, BAND_HALF_WIDTH_M), offsetPolyline(d.path, -BAND_HALF_WIDTH_M)]
          : [],
      ),
      getPath: (d) => d.map(([x, y]) => [x, y, 0.07] as Vec3),
      getColor: INK,
      widthUnits: 'pixels',
      getWidth: 2,
      parameters: { depthWriteEnabled: false },
    }),
    new PathLayer<WorkZone>({
      id: 'work-bands',
      data: zones,
      getPath: (d) => d.path.map(([x, y]) => [x, y, 0.06] as Vec3),
      // See-through, so the pipe being worked on still shows inside the zone.
      getColor: [255, 255, 255, 150],
      widthUnits: 'meters',
      getWidth: BAND_HALF_WIDTH_M * 2,
      capRounded: true,
      jointRounded: true,
      parameters: { depthWriteEnabled: false },
    }),
    new ScatterplotLayer<WorkZone>({
      id: 'work-pulse',
      data: zones,
      getPosition: (d) => [d.position[0], d.position[1], 0.1],
      getRadius: 4,
      radiusScale: 1 + phase * 2.5,
      stroked: true,
      filled: false,
      lineWidthUnits: 'pixels',
      getLineWidth: 2.5,
      getLineColor: palette.ink,
      opacity: 1 - phase,
      parameters: { depthWriteEnabled: false },
    }),
    new LineLayer<WorkZone>({
      id: 'work-stems',
      data: zones,
      getSourcePosition: (d) => [d.position[0], d.position[1], 0],
      getTargetPosition: (d) => [d.position[0], d.position[1], WORK_PIN_LIFT_M],
      getColor: palette.ink,
      getWidth: 1.5,
    }),
    new IconLayer<WorkZone>({
      id: 'work-pins',
      data: zones,
      pickable: true,
      getPosition: (d) => [d.position[0], d.position[1], WORK_PIN_LIFT_M],
      getIcon: () => pinIcon('work', '#ffffff', '#1b2230', '#1b2230'),
      getSize: 34,
      parameters: { depthCompare: 'always' },
    }),
  ];
};

interface ShaftLabel {
  position: Vec3;
  text: string;
  utility: UtilityKind | null;
  /** Pixels pushed down so it doesn't sit on the label above. */
  dy: number;
}

// Label height plus a little air.
const SHAFT_LABEL_GAP_PX = 23;

/**
 * The dig probe: a glass shaft drilled down from the chosen spot. `progress` (0 to 1) drives the
 * drilling; each utility's layer lights up as the shaft passes its usual depth.
 */
export const probeLayers = (
  probe: ProbeView,
  progress: number,
  zOf: (depthFt: number) => number,
  project: (point: Vec3) => [number, number] | null,
  palette: ScenePalette = scenePalette('light'),
) => {
  const [x, y] = probe.position;
  const drilledFt = probe.depthFt * progress;
  const bottom = zOf(Math.max(0.05, drilledFt));
  const passed = probe.hits.filter((hit) => hit.depthFt <= drilledFt || hit.reach === 'unknown');
  const done = progress >= 1;

  // Utilities without a published depth all sit at the top of the shaft, so they share one label.
  const unknown = passed.filter((hit) => hit.reach === 'unknown');
  const known = passed.filter((hit) => hit.reach !== 'unknown');
  const unknownNames = unknown.map((hit) => UTILITY_STYLES[hit.utility].label);
  const wanted: Omit<ShaftLabel, 'dy'>[] = [
    ...(unknown.length
      ? [
          {
            position: [x, y, zOf(Math.min(unknown[0]!.depthFt, drilledFt))] as Vec3,
            text: `${unknownNames.map((name, i) => (i ? name.toLowerCase() : name)).join(' and ')}, any depth`,
            utility: unknown[0]!.utility,
          },
        ]
      : []),
    ...known.map((hit) => ({
      position: [x, y, zOf(hit.depthFt)] as Vec3,
      text: `${UTILITY_STYLES[hit.utility].label}, ${formatFeet(hit.depthFt)}`,
      utility: hit.utility,
    })),
    ...(done
      ? [
          {
            position: [x, y, bottom] as Vec3,
            text: `Your dig, ${formatFeet(probe.depthFt)}`,
            utility: null,
          },
        ]
      : []),
  ];

  // Seen at an angle, the shaft's depths crowd together on screen, so the labels stack in a
  // column in depth order instead of sitting exactly at each layer.
  const offsets = stackOffsets(
    wanted.map((label) => project(label.position)?.[1] ?? 0),
    SHAFT_LABEL_GAP_PX,
  );
  const labels: ShaftLabel[] = wanted.map((label, i) => ({ ...label, dy: offsets[i] ?? 0 }));

  return [
    new SimpleMeshLayer({
      id: 'probe-shaft',
      data: [probe],
      mesh: TUBE,
      material: SHAFT_GLASS,
      getPosition: [x, y, bottom / 2],
      getTransformMatrix: segmentMatrix([x, y, 0], [x, y, bottom], SHAFT_RADIUS_M),
      // White glass: APWA white is the color for proposed excavation.
      getColor: [255, 255, 255, 235],
      parameters: { depthWriteEnabled: false },
    }),
    new ScatterplotLayer({
      id: 'probe-rim',
      data: [0, 1],
      getPosition: (d: number) => [x, y, d === 0 ? 0.08 : bottom],
      getRadius: SHAFT_RADIUS_M,
      stroked: true,
      // The top is an open ring around the hole; the bottom is the floor of the dig.
      getFillColor: (d: number) => (d === 1 ? WHITE : [0, 0, 0, 0]),
      lineWidthUnits: 'pixels',
      getLineWidth: 2.5,
      // The rim of the hole is on the ground, so it takes the ground's ink.
      getLineColor: palette.ink,
      parameters: { depthCompare: 'always' },
    }),
    new ScatterplotLayer({
      id: 'probe-layers',
      data: passed,
      getPosition: (d) => [
        x,
        y,
        zOf(d.reach === 'unknown' ? Math.min(d.depthFt, drilledFt) : d.depthFt),
      ],
      getRadius: SHAFT_RADIUS_M * 1.6,
      getFillColor: (d) => colorOf(d.utility, 230),
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineWidth: 1.5,
      getLineColor: [255, 255, 255, 255],
      parameters: { depthCompare: 'always' },
    }),
    new TextLayer<ShaftLabel>({
      id: 'probe-labels',
      data: labels,
      getPosition: (d) => d.position,
      getText: (d) => d.text,
      getSize: 12,
      getColor: (d) => (d.utility ? inkRgb(d.utility) : INK),
      getTextAnchor: 'start',
      getAlignmentBaseline: 'center',
      getPixelOffset: (d) => [22, d.dy],
      background: true,
      getBackgroundColor: (d) => (d.utility ? colorOf(d.utility) : WHITE),
      getBorderColor: INK,
      getBorderWidth: (d) => (d.utility ? 0 : 1.5),
      backgroundPadding: [6, 3],
      backgroundBorderRadius: 4,
      fontFamily: FONT,
      fontWeight: 700,
      characterSet: 'auto',
      parameters: { depthCompare: 'always' },
    }),
  ];
};
