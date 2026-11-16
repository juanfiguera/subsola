import { describe, expect, it } from 'vitest';
import { fartherLines } from './farther';
import type { LotReport } from '../../src/report';
import type { PipeRun } from '../../src/scene/build';

/**
 * Shaped like 1437 Bannock St, Denver: no inventory entry, so the lot line is the address point,
 * which sits on the City and County Building about 54 m from the nearest sewer and farther from
 * everything else (measured on the live build, 2026-11-11).
 */
const report = (mains: LotReport['mains'] = []): LotReport => ({
  lotLine: { point: [0, 0], from: 'address' },
  bbl: null,
  water: null,
  sewer: null,
  connectionPermits: [],
  mains,
  live: [],
  recent: [],
  digSpots: [],
  fixtures: [],
  sideSewer: null,
  nearbySideSewer: null,
});

const run = (
  utility: PipeRun['utility'],
  eastM: number,
  extra: Partial<PipeRun> = {},
): PipeRun => ({
  ref: `${utility}-${eastM}`,
  utility,
  path: [
    [eastM, -50],
    [eastM, 50],
  ],
  depthFt: 5,
  digSpots: 0,
  ...extra,
});

describe('fartherLines', () => {
  const runs = [
    run('sewer', 54, {
      surveyed: { source: 'denSewers', utility: 'sewer' } as PipeRun['surveyed'],
    }),
    run('sewer', 70),
    run('water', 57, { assumed: true }),
    run('gas', 62),
    run('electric', 300),
  ];

  it('names the nearest line of each kind when nothing is within the lot report’s reach', () => {
    expect(fartherLines(report(), runs)).toEqual([
      { label: 'Sewer', distanceFromLotLineFt: 177, placedFrom: 'owner map' },
      { label: 'Water', distanceFromLotLineFt: 187, placedFrom: 'inferred' },
      { label: 'Gas', distanceFromLotLineFt: 203, placedFrom: 'permits' },
    ]);
  });

  it('adds nothing when the report already found lines out front', () => {
    const found = report([{ utility: 'gas' } as LotReport['mains'][number]]);
    expect(fartherLines(found, runs)).toEqual([]);
  });
});
