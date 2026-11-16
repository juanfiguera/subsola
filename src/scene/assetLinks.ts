import type { UtilityKind } from '../utilities';
import { isRecycled } from '../sources/mains';
import type { PipeRun, ScenePoint } from './build';
import { closestOnPolyline, type Vec2 } from './local';

/**
 * How a street fixture reaches its main: a shaft straight down from the fixture, then a branch
 * across to the main. Both are drawn at the main's depth, since the fixtures' own depths aren't
 * published.
 */
export interface AssetLink {
  /** The fixture's ref, so picking a link opens the fixture's card. */
  ref: string;
  kind: 'hydrant' | 'catch-basin' | 'manhole';
  utility: UtilityKind;
  /** Under the fixture. */
  from: Vec2;
  /** On the main. */
  to: Vec2;
  depthFt: number;
  /** Hydrants only: DEP sets the branch's gate valve 1 ft from the main. */
  valve?: Vec2;
}

// Farther than this from every drawn main of its utility, a fixture probably sits on a street
// with no permits on record, so a branch to some other street would be wrong.
const MAX_REACH_M = 30;
// DEP hydrant setting standard WM0020: "the distance of the hydrant valve from the water main
// will be 1 foot".
const HYDRANT_VALVE_FROM_MAIN_M = 0.3048;

/**
 * The mains a fixture may connect to. Storm drains and recycled water are kept apart from the
 * rest of their utility: a sanitary manhole sits on a sewer, a San Diego or Los Angeles inlet
 * drains only to a storm drain, and no hydrant is fed recycled water. Elsewhere a basin takes
 * any sewer.
 */
type Network = UtilityKind | 'storm' | 'recycled';

const networkOf = (run: PipeRun): Network =>
  run.surveyed?.use === 'storm' ? 'storm' : isRecycled(run.surveyed) ? 'recycled' : run.utility;

/** Which mains each fixture connects to. Untagged manholes have no utility, so none. */
const networksOf = (point: ScenePoint): Network[] => {
  // The drawn sewer lanes come from permits, which don't say storm or sanitary; a basin in a
  // storm sewer area drains to a storm line whose route isn't published, so it isn't connected.
  if (point.kind === 'catch-basin')
    return point.stormSewer ? [] : point.stormOnly ? ['storm'] : ['sewer', 'storm'];
  if (point.kind === 'hydrant') return ['water'];
  if (point.kind === 'manhole' && point.utility)
    return point.stormOnly
      ? ['storm']
      : point.utility === 'sewer'
        ? ['sewer', 'storm']
        : [point.utility];
  return [];
};

interface Reachable {
  run: PipeRun;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Each network's runs with their bounding boxes, so far-off runs are skipped without measuring. */
const reachableByNetwork = (runs: PipeRun[]) => {
  const byNetwork = new Map<Network, Reachable[]>();
  for (const run of runs) {
    if (run.path.length < 2) continue;
    const xs = run.path.map((p) => p[0]);
    const ys = run.path.map((p) => p[1]);
    const entry = {
      run,
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
    const network = networkOf(run);
    const list = byNetwork.get(network);
    if (list) list.push(entry);
    else byNetwork.set(network, [entry]);
  }
  return byNetwork;
};

export const linkAssets = (points: ScenePoint[], runs: PipeRun[]): AssetLink[] => {
  const byNetwork = reachableByNetwork(runs);
  return points.flatMap((point): AssetLink[] => {
    const networks = networksOf(point);
    if (!networks.length || point.kind === 'permit-point') return [];
    const [x, y] = point.position;
    let nearest: { run: PipeRun; point: Vec2; distance: number } | null = null;
    for (const box of networks.flatMap((network) => byNetwork.get(network) ?? [])) {
      const reach = nearest?.distance ?? MAX_REACH_M;
      if (
        x < box.minX - reach ||
        x > box.maxX + reach ||
        y < box.minY - reach ||
        y > box.maxY + reach
      )
        continue;
      const closest = closestOnPolyline(box.run.path, point.position);
      if (closest.distance <= reach && (!nearest || closest.distance < nearest.distance))
        nearest = { run: box.run, ...closest };
    }
    if (!nearest) return [];
    const kind = point.kind as AssetLink['kind'];
    const [from, to] = [point.position, nearest.point];
    const length = nearest.distance;
    const valve: Vec2 | undefined =
      kind === 'hydrant' && length > HYDRANT_VALVE_FROM_MAIN_M
        ? [
            to[0] + ((from[0] - to[0]) * HYDRANT_VALVE_FROM_MAIN_M) / length,
            to[1] + ((from[1] - to[1]) * HYDRANT_VALVE_FROM_MAIN_M) / length,
          ]
        : undefined;
    return [
      {
        ref: point.ref,
        kind,
        utility: nearest.run.utility,
        from,
        to,
        depthFt: nearest.run.depthFt,
        ...(valve ? { valve } : {}),
      },
    ];
  });
};
