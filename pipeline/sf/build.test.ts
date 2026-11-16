import { describe, expect, it } from 'vitest';
import { sewerHeightIn } from './build';

describe('sewerHeightIn', () => {
  it('reads round, egg-shaped and box sewers', () => {
    expect(sewerHeightIn('10"')).toBe(10);
    expect(sewerHeightIn(`3'-0" x 5'-0"`)).toBe(60);
    expect(sewerHeightIn(`6'-6"`)).toBe(78);
  });

  it('leaves an unknown size unknown', () => {
    expect(sewerHeightIn('UNK')).toBeNull();
    expect(sewerHeightIn(null)).toBeNull();
  });
});
