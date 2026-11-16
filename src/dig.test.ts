import { describe, expect, it } from 'vitest';
import { assessDig } from './dig';
import type { Vec2 } from './scene/local';

const street: Vec2[] = [
  [-50, 0],
  [50, 0],
];

describe('assessDig', () => {
  it('flags a dig that reaches the depth where gas usually sits', () => {
    const result = assessDig([0, 6], 3, [{ utility: 'gas', path: street }]);
    expect(result.level).toBe('call-first');
    expect(result.hits[0]).toMatchObject({ utility: 'gas', reach: 'reaches' });
  });

  it('calls a shallow dig above the sewer likely deeper, never clear', () => {
    const result = assessDig([0, 6], 2, [{ utility: 'sewer', path: street }]);
    expect(result.level).toBe('likely-deeper');
    expect(result.hits[0]?.reach).toBe('above');
  });

  it('treats utilities without a published depth as possible at any depth', () => {
    const result = assessDig([0, 3], 1, [{ utility: 'electric', path: street }]);
    expect(result.level).toBe('call-first');
    expect(result.hits[0]?.reach).toBe('unknown');
  });

  it('reports no records when nothing runs near the spot', () => {
    expect(assessDig([0, 80], 3, [{ utility: 'gas', path: street }]).level).toBe('no-records');
  });

  it('lists each utility once, shallowest first', () => {
    const result = assessDig([0, 2], 3, [
      { utility: 'water', path: street },
      { utility: 'gas', path: street },
      {
        utility: 'gas',
        path: [
          [0, 10],
          [10, 10],
        ],
      },
    ]);
    expect(result.hits.map((hit) => hit.utility)).toEqual(['gas', 'water']);
  });
});
