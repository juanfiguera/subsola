import { afterEach, describe, expect, it } from 'vitest';
import { drawnDepthFt, FEET_TO_METERS, NYC_DEPTH_STANDARDS, useDepthStandards } from '../depth';
import type { PipeRun } from './build';
import { depthLayers, separatedDepths } from './depthLayers';
import { PIPE_RADIUS_M } from './tubes';

const STRETCH = 6;
const meters = (feet: number) => feet * FEET_TO_METERS * STRETCH;

describe('separatedDepths', () => {
  it("stacks New York's three depth-unknown utilities so crossings pass under each other", () => {
    const drawn = separatedDepths({ telecom: 0.6, electric: 0.6, steam: 0.6, gas: 1.5 }, STRETCH);
    expect(drawn.telecom).toBe(0.6);
    const order = (['telecom', 'electric', 'steam', 'gas'] as const).map((u) => meters(drawn[u]!));
    for (let i = 1; i < order.length; i++) {
      const [a, b] = [
        ['telecom', 'electric', 'steam', 'gas'][i - 1]!,
        ['telecom', 'electric', 'steam', 'gas'][i]!,
      ];
      const clear =
        PIPE_RADIUS_M[a as keyof typeof PIPE_RADIUS_M] +
        PIPE_RADIUS_M[b as keyof typeof PIPE_RADIUS_M];
      expect(order[i]! - order[i - 1]!).toBeGreaterThan(clear);
    }
  });

  it('separates two utilities filed at the same depth, the shallower kind on top', () => {
    const drawn = separatedDepths({ gas: 1.5, telecom: 1.5 }, STRETCH);
    expect(drawn.telecom).toBe(1.5);
    expect(drawn.gas).toBeGreaterThan(1.5);
  });

  it('never moves a line up, and leaves well separated ones alone', () => {
    expect(separatedDepths({ gas: 1.5, water: 3.4, sewer: 5 }, STRETCH)).toEqual({
      gas: 1.5,
      water: 3.4,
      sewer: 5,
    });
  });
});

describe('depthLayers', () => {
  afterEach(() => useDepthStandards(NYC_DEPTH_STANDARDS));

  const run = (
    utility: PipeRun['utility'],
    depthFt: number,
    extra: Partial<PipeRun> = {},
  ): PipeRun => ({
    ref: `permit-${utility}`,
    utility,
    path: [
      [0, 0],
      [10, 0],
    ],
    depthFt,
    digSpots: 0,
    ...extra,
  });
  // The scene's slab push, simplified: nothing shallower than 0.6 ft.
  const clear = <T extends { depthFt: number }>(pipe: T): T =>
    pipe.depthFt >= 0.6 ? pipe : { ...pipe, depthFt: 0.6 };

  it("moves New York's runs and pieces at their standard depth to separate depths", () => {
    useDepthStandards(NYC_DEPTH_STANDARDS);
    const runs = (['telecom', 'electric', 'steam', 'gas'] as const).map((utility) =>
      clear(run(utility, drawnDepthFt(NYC_DEPTH_STANDARDS[utility]!))),
    );
    const layer = depthLayers(runs, STRETCH, clear);
    const depths = runs.map((r) => layer(r).depthFt);
    expect(new Set(depths).size).toBe(4);
    // A piece of the gas run, at the same depth, moves with it.
    const gasPiece = { utility: 'gas' as const, depthFt: runs[3]!.depthFt };
    expect(layer(gasPiece).depthFt).toBe(depths[3]);
  });

  it('leaves a run with a measured depth where it is', () => {
    useDepthStandards(NYC_DEPTH_STANDARDS);
    const measured = run('telecom', 0.6, { surveyed: { depthFt: 0.6 } as PipeRun['surveyed'] });
    const others = [clear(run('electric', 0.5)), clear(run('telecom', 0.5))];
    const layer = depthLayers([...others, measured], STRETCH, clear);
    expect(layer({ ...measured, depthFt: 0.7 })).toEqual({ ...measured, depthFt: 0.7 });
  });
});
