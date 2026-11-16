import { depthStandards, type DepthStandard } from './depth';
import type { UtilityKind } from './utilities';
import { closestOnPolyline, type Vec2 } from './scene/local';

export interface DigTask {
  id: string;
  label: string;
  depthFt: number;
}

export const DIG_TASKS: DigTask[] = [
  { id: 'garden', label: 'Garden bed', depthFt: 1 },
  { id: 'tree', label: 'Tree or shrub', depthFt: 2 },
  { id: 'fence', label: 'Fence post', depthFt: 3 },
  { id: 'post', label: 'Sign or deck post', depthFt: 4 },
];

// Permits place a utility on a block, not at a spot across it, so anything this close could be
// under the spot: street width plus the sidewalk.
export const NEAR_M = 20;

/** Whether a dig to the chosen depth gets down to where a utility usually sits. */
export type Reach = 'reaches' | 'above' | 'unknown';

export interface DigHit {
  utility: UtilityKind;
  distanceM: number;
  standard: DepthStandard;
  reach: Reach;
}

export type DigLevel = 'call-first' | 'likely-deeper' | 'no-records';

export interface DigAssessment {
  depthFt: number;
  hits: DigHit[];
  level: DigLevel;
}

export const assessDig = (
  point: Vec2,
  depthFt: number,
  runs: { utility: UtilityKind; path: Vec2[] }[],
): DigAssessment => {
  const nearest = new Map<UtilityKind, number>();
  for (const run of runs) {
    if (!depthStandards()[run.utility]) continue;
    const { distance } = closestOnPolyline(run.path, point);
    if (distance > NEAR_M) continue;
    nearest.set(run.utility, Math.min(distance, nearest.get(run.utility) ?? Infinity));
  }
  const hits: DigHit[] = [...nearest]
    .map(([utility, distanceM]) => {
      const standard = depthStandards()[utility]!;
      const reach: Reach =
        standard.basis === 'unknown'
          ? 'unknown'
          : depthFt >= standard.shallowestFt
            ? 'reaches'
            : 'above';
      return { utility, distanceM, standard, reach };
    })
    .sort((a, b) => a.standard.shallowestFt - b.standard.shallowestFt);
  const level: DigLevel = !hits.length
    ? 'no-records'
    : hits.some((hit) => hit.reach !== 'above')
      ? 'call-first'
      : 'likely-deeper';
  return { depthFt, hits, level };
};
