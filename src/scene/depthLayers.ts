import type { UtilityKind } from '../utilities';
import { depthStandards, drawnDepthFt, FEET_TO_METERS } from '../depth';
import type { PipeRun } from './build';
import { PIPE_RADIUS_M } from './tubes';

// Shallow to deep, as crews usually find them, for utilities drawn at the same depth.
const ORDER: UtilityKind[] = ['telecom', 'electric', 'gas', 'capital', 'steam', 'water', 'sewer'];
// Elbows and couplings are drawn a little wider than the pipe; this is FITTING_SCALE in tubes.ts
// with some room, so two fittings at a crossing don't touch either.
const FITTING_ROOM = 1.25;

/**
 * Where each utility's estimated lines are drawn so that no two cross through each other. Lines
 * placed from standards sit at one depth per utility, and several utilities share a depth: New
 * York's electric, telecom and steam are all "depth unknown", and California's telecom and gas
 * are both 1 ft 6 in. They sit in separate lanes along a street, but where streets cross, a line
 * on one meets a line on the other at the same depth. Each utility is moved down, never up, just
 * far enough to clear the one above it at the current depth stretch. Only the drawing moves, like
 * `clearOfSlab`: labels and the dig check keep the published depth.
 *
 * `depths` is each utility's drawn depth in feet; the answer is where to draw it instead.
 */
export const separatedDepths = (
  depths: Partial<Record<UtilityKind, number>>,
  stretch: number,
): Partial<Record<UtilityKind, number>> => {
  const metersPerFoot = FEET_TO_METERS * stretch;
  const sorted = (Object.keys(depths) as UtilityKind[]).sort(
    (a, b) => depths[a]! - depths[b]! || ORDER.indexOf(a) - ORDER.indexOf(b),
  );
  const result: Partial<Record<UtilityKind, number>> = {};
  let above: { utility: UtilityKind; meters: number } | null = null;
  for (const utility of sorted) {
    const feet = depths[utility]!;
    const own = feet * metersPerFoot;
    const clear: number = above
      ? above.meters + (PIPE_RADIUS_M[above.utility] + PIPE_RADIUS_M[utility]) * FITTING_ROOM
      : 0;
    const pushed = clear > own;
    // A line that stays put keeps its exact depth, so pieces at it are still recognized.
    result[utility] = pushed ? clear / metersPerFoot : feet;
    above = { utility, meters: pushed ? clear : own };
  }
  return result;
};

type Placed = { utility: UtilityKind; depthFt: number };

/**
 * Moves lines drawn at their utility's standard depth so no two utilities cross through each other
 * (see `separatedDepths`). Every utility on the street counts, shown or hidden, so switching a
 * layer off doesn't shift the others. Lines with a measured depth, or their own size, stay put.
 * `clear` is the scene's own push below the road slab, applied first.
 */
export const depthLayers = (
  runs: PipeRun[],
  stretch: number,
  clear: <T extends Placed>(pipe: T) => T,
) => {
  const standards = depthStandards();
  const base: Partial<Record<UtilityKind, number>> = {};
  for (const run of runs) {
    const standard = standards[run.utility];
    if (!standard || run.surveyed?.depthFt != null || base[run.utility] !== undefined) continue;
    base[run.utility] = clear({ utility: run.utility, depthFt: drawnDepthFt(standard) }).depthFt;
  }
  const moved = separatedDepths(base, stretch);
  return <T extends Placed>(pipe: T): T => {
    const from = base[pipe.utility];
    const to = moved[pipe.utility];
    return from !== undefined && to !== undefined && to !== from && pipe.depthFt === from
      ? { ...pipe, depthFt: to }
      : pipe;
  };
};
