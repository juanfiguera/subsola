import { describe, expect, it } from 'vitest';
import { endKey, stormDrainCover, stormDrainMaterial, stormDrainSizeIn } from './drains';

describe('stormDrainMaterial', () => {
  it('reads the codes, and says when a pipe is a box culvert', () => {
    expect(stormDrainMaterial('RCP', 'D')).toBe('Reinforced concrete');
    expect(stormDrainMaterial('RC', 'X')).toBe('Reinforced concrete box');
    expect(stormDrainMaterial('UNK', 'X')).toBe('Box culvert');
    expect(stormDrainMaterial('UNK', 'D')).toBeNull();
    expect(stormDrainMaterial(null, 'D')).toBeNull();
    expect(stormDrainMaterial('CMPC', 'D')).toBe('CMPC');
  });
});

describe('stormDrainSizeIn', () => {
  it('takes the diameter, or a box culvert height', () => {
    expect(stormDrainSizeIn(18, 0)).toBe(18);
    expect(stormDrainSizeIn(0, 48)).toBe(48);
    expect(stormDrainSizeIn(null, null)).toBeNull();
  });

  it('leaves out sizes too big to draw', () => {
    expect(stormDrainSizeIn(0, 4323)).toBeNull();
  });
});

describe('endKey', () => {
  it('matches a pipe end to a structure at the same point', () => {
    expect(endKey([-117.15051233300855, 32.77084636183361])).toBe(
      endKey([-117.150512333, 32.770846362]),
    );
  });
});

describe('stormDrainCover', () => {
  it('averages rim less invert at both ends, less the pipe', () => {
    // 30 in pipe from an inlet with a 46.5 ft rim at a 31.3 ft invert; the outlet has no rim.
    expect(
      stormDrainCover(
        [
          [46.5, 31.3],
          [undefined, 25.32],
        ],
        30,
      ),
    ).toBe(12.7);
    expect(
      stormDrainCover(
        [
          [10, 5],
          [12, 5],
        ],
        12,
      ),
    ).toBe(5);
  });

  it('skips blank inverts and gives null with nothing to measure', () => {
    expect(stormDrainCover([[46.5, 0]], 18)).toBeNull();
    expect(stormDrainCover([[undefined, 30]], 18)).toBeNull();
    expect(stormDrainCover([[30, 40]], 18)).toBeNull();
  });
});
