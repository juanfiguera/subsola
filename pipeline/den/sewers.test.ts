import { describe, expect, it } from 'vitest';
import { addRim, denMaterial, denOwner, denPipeCover, denPipeSize, type Rims } from './sewers';

describe('denPipeCover', () => {
  const rims: Rims = new Map();
  addRim(rims, '24439SAMH', 5410);
  addRim(rims, '24441SAMH', 5406.14);
  // A blank ground and a depth typed where the elevation goes.
  addRim(rims, '1SAMH', 0);
  addRim(rims, '2SAMH', 17);

  it('averages the ground less the invert at both ends, less the pipe', () => {
    // 9.08 ft and 9.31 ft to the invert, less an 8 in pipe.
    expect(
      denPipeCover(
        rims,
        [
          ['24439SAMH', 5400.92],
          ['24441SAMH', 5396.83],
        ],
        8,
      ),
    ).toBe(8.5);
  });

  it('uses one end when the other has no manhole ground or invert', () => {
    expect(
      denPipeCover(
        rims,
        [
          ['24439SAMH', 5400.92],
          ['1SAMH', 5399],
        ],
        12,
      ),
    ).toBe(8.1);
    expect(
      denPipeCover(
        rims,
        [
          ['24439SAMH', 0],
          ['24441SAMH', 5396.83],
        ],
        8,
      ),
    ).toBe(8.6);
  });

  it('gives no depth without a manhole ground at either end', () => {
    expect(
      denPipeCover(
        rims,
        [
          ['1SAMH', 5399],
          ['2SAMH', 5398],
        ],
        8,
      ),
    ).toBeNull();
    expect(denPipeCover(rims, [['missing', 5399]], 8)).toBeNull();
  });

  it('turns down an invert above the ground', () => {
    expect(denPipeCover(rims, [['24441SAMH', 5410]], 8)).toBeNull();
  });
});

describe('Denver pipe facts', () => {
  it('spells out materials and leaves unknown ones blank', () => {
    expect(denMaterial('VCP')).toBe('Vitrified clay');
    expect(denMaterial('XXX')).toBeNull();
    expect(denMaterial('ZZ')).toBe('ZZ');
  });

  it("names an owner only when it isn't the city", () => {
    expect(denOwner('MWRD')).toBe('Metro Water Recovery');
    expect(denOwner('DPUB')).toBeNull();
  });

  it('reads a box by its height and drops impossible sizes', () => {
    expect(denPipeSize(48, 36)).toBe(36);
    expect(denPipeSize(15, null)).toBe(15);
    expect(denPipeSize(0, 0)).toBeNull();
    expect(denPipeSize(600, 600)).toBeNull();
  });
});
