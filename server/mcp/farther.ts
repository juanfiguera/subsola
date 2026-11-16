import type { LotReport } from '../../src/report';
import type { PipeRun } from '../../src/scene/build';
import { closestOnPolyline, type Vec2 } from '../../src/scene/local';
import { isStormDrain } from '../../src/sources/mains';
import { FEET_TO_METERS } from '../../src/depth';
import { UTILITY_STYLES } from '../../src/utilities';

/**
 * When nothing is drawn within the report's reach of the lot line, the nearest lines farther out,
 * so an answer can say where the street's lines are instead of only "none". It happens where a
 * city's address point sits on a building set far back from any street: Denver's address points
 * sit on the building, and at 1437 Bannock St (the City and County Building) the nearest street
 * centerline is 60 m away. The map's lot report says "none" there too; this adds what an
 * assistant can't see on the map.
 */

// Past this, a line is on another block, not the one the lot faces.
const FARTHER_REACH_M = 120;
const MAX_FARTHER = 4;

export interface FartherLine {
  label: string;
  distanceFromLotLineFt: number;
  placedFrom: 'owner map' | 'permits' | 'inferred';
}

export const fartherLines = (report: LotReport, runs: PipeRun[]): FartherLine[] => {
  if (report.mains.length) return [];
  const lotLine: Vec2 = report.lotLine.point;
  const nearest = new Map<string, FartherLine & { distanceM: number }>();
  for (const run of runs) {
    if ('meeting' in run || run.surveyed?.use === 'side') continue;
    const { distance } = closestOnPolyline(run.path, lotLine);
    if (distance > FARTHER_REACH_M) continue;
    const label = isStormDrain(run.surveyed) ? 'Storm drain' : UTILITY_STYLES[run.utility].label;
    const seen = nearest.get(label);
    if (seen && seen.distanceM <= distance) continue;
    nearest.set(label, {
      label,
      distanceM: distance,
      distanceFromLotLineFt: Math.round(distance / FEET_TO_METERS),
      placedFrom: run.surveyed ? 'owner map' : run.assumed ? 'inferred' : 'permits',
    });
  }
  return [...nearest.values()]
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, MAX_FARTHER)
    .map(({ label, distanceFromLotLineFt, placedFrom }) => ({
      label,
      distanceFromLotLineFt,
      placedFrom,
    }));
};
