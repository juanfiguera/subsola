import { describe, expect, it } from 'vitest';
import { segmentMatrix } from './meshes';
import type { Vec3 } from './local';

const apply = (m: number[], [x, y, z]: Vec3): Vec3 => [
  m[0]! * x + m[4]! * y + m[8]! * z,
  m[1]! * x + m[5]! * y + m[9]! * z,
  m[2]! * x + m[6]! * y + m[10]! * z,
];

describe('segmentMatrix', () => {
  const a: Vec3 = [2, 3, -1];
  const b: Vec3 = [8, 11, -1];
  const m = segmentMatrix(a, b, 0.4);

  it('stretches the unit tube end to end along the segment', () => {
    const [x, y, z] = apply(m, [0.5, 0, 0]);
    expect(x).toBeCloseTo(3);
    expect(y).toBeCloseTo(4);
    expect(z).toBeCloseTo(0);
  });

  it('keeps the tube round at the given radius', () => {
    expect(Math.hypot(...apply(m, [0, 1, 0]))).toBeCloseTo(0.4);
    expect(Math.hypot(...apply(m, [0, 0, 1]))).toBeCloseTo(0.4);
  });
});
