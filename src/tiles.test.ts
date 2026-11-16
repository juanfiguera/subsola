import { describe, expect, it } from 'vitest';
import { CELL_M, cellsAround, mergeBy } from './tiles';

describe('cellsAround', () => {
  it('starts with the cell under the point', () => {
    expect(cellsAround([10, -20], 0).map((c) => c.key)).toEqual(['0,0']);
  });

  it('takes every cell any part of which is in reach, nearest first', () => {
    const keys = cellsAround([CELL_M * 0.4, 0], CELL_M * 0.2).map((c) => c.key);
    expect(keys).toEqual(['0,0', '1,0']);
    expect(cellsAround([0, 0], CELL_M)).toHaveLength(9);
  });
});

describe('mergeBy', () => {
  it('adds only what is new, and keeps the same array when nothing is', () => {
    const existing = [{ id: 'a' }, { id: 'b' }];
    expect(mergeBy(existing, [{ id: 'b' }, { id: 'c' }, { id: 'c' }], (x) => x.id)).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]);
    expect(mergeBy(existing, [{ id: 'a' }], (x) => x.id)).toBe(existing);
  });
});
