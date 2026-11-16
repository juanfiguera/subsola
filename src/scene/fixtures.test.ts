import { describe, expect, it } from 'vitest';
import type { ScenePoint } from './build';
import type { AssetLink } from './assetLinks';
import { poseFixtures } from './fixtures';

const point = (ref: string, kind: ScenePoint['kind']): ScenePoint => ({
  ref,
  kind,
  utility: kind === 'hydrant' ? 'water' : 'sewer',
  position: [0, 0],
});

describe('poseFixtures', () => {
  it('turns a fixture so its street side faces the main it connects to', () => {
    const link: AssetLink = {
      ref: 'asset-1',
      kind: 'hydrant',
      utility: 'water',
      from: [0, 0],
      to: [0, -4],
      depthFt: 3.4,
    };
    const [pose] = poseFixtures([point('asset-1', 'hydrant')], [link], []);
    expect(pose?.heading).toBeCloseTo(-Math.PI / 2);
    expect(pose?.link).toBe(link);
  });

  it('turns a lamp toward the nearest curb', () => {
    const curb: [number, number][] = [
      [-10, 2],
      [10, 2],
    ];
    const [pose] = poseFixtures([point('asset-4', 'street-lamp')], [], [curb]);
    expect(pose?.heading).toBeCloseTo(Math.PI / 2);
  });

  it('places fixtures with no main, and skips things that are not fixtures', () => {
    const poses = poseFixtures(
      [point('asset-2', 'catch-basin'), point('asset-3', 'permit-point')],
      [],
      [],
    );
    expect(poses.map((p) => p.ref)).toEqual(['asset-2']);
    expect(poses[0]?.heading).toBe(0);
  });
});

describe('poseFixtures for signals', () => {
  const signal: ScenePoint = {
    ref: 'asset-9',
    kind: 'traffic-signal',
    utility: 'electric',
    position: [0, 0],
  };

  it('stands the pole behind the nearest corner, arm toward the intersection', () => {
    // The southwest corner, 6 m out on each axis.
    const corner: [number, number][] = [
      [-6, -20],
      [-6, -6],
      [-20, -6],
    ];
    const [pose] = poseFixtures([signal], [], [corner]);
    expect(pose?.position[0]).toBeCloseTo(-6 - 0.6 / Math.SQRT2);
    expect(pose?.position[1]).toBeCloseTo(-6 - 0.6 / Math.SQRT2);
    expect(pose?.heading).toBeCloseTo(Math.PI / 4);
  });

  it('leaves a signal with no corner nearby to its pin', () => {
    expect(poseFixtures([signal], [], [])).toEqual([]);
  });
});
