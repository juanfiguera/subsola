import { describe, expect, it } from 'vitest';
import { sideSewerMaterial, sideSewerNetworks, stitchPaths } from './sideSewers';

describe('sideSewerNetworks', () => {
  it('joins stretches where one flows into the next', () => {
    // Two buildings' branches meet at point 3, then run to point 9 on the main.
    const networks = sideSewerNetworks([
      { ups: 1, dns: 3 },
      { ups: 2, dns: 3 },
      { ups: 3, dns: 9 },
    ]);
    expect(new Set(networks).size).toBe(1);
  });

  it('keeps neighbours apart where they only meet on the main', () => {
    const networks = sideSewerNetworks([
      { ups: 1, dns: 9 },
      { ups: 2, dns: 9 },
      { ups: 4, dns: 1 },
    ]);
    expect(networks[0]).toBe(networks[2]);
    expect(networks[0]).not.toBe(networks[1]);
  });

  it('leaves a stretch with no keys on its own', () => {
    const networks = sideSewerNetworks([
      { ups: null, dns: null },
      { ups: null, dns: null },
    ]);
    expect(networks[0]).not.toBe(networks[1]);
  });
});

describe('stitchPaths', () => {
  it('lays a run of fittings end to end', () => {
    expect(
      stitchPaths([
        [
          [1, 0],
          [2, 0],
        ],
        [
          [0, 0],
          [1, 0],
        ],
        [
          [2, 0],
          [3, 0],
        ],
      ]),
    ).toEqual([
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
      ],
    ]);
  });

  it('keeps branches as lines of their own', () => {
    const lines = stitchPaths([
      [
        [0, 1],
        [1, 0],
      ],
      [
        [0, -1],
        [1, 0],
      ],
      [
        [1, 0],
        [2, 0],
      ],
    ]);
    expect(lines).toHaveLength(3);
  });

  it('still draws a loop', () => {
    const lines = stitchPaths([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 0],
        [0, 0],
      ],
    ]);
    expect(lines.flat()).toHaveLength(3);
  });
});

describe('sideSewerMaterial', () => {
  it("shortens SPU's words", () => {
    expect(sideSewerMaterial('Polyvinyl Chloride')).toBe('PVC');
    expect(sideSewerMaterial('Cast Iron Pipe')).toBe('Cast iron');
    expect(sideSewerMaterial('Vitrified Clay')).toBe('Vitrified clay');
    expect(sideSewerMaterial('Unknown')).toBeNull();
    expect(sideSewerMaterial(null)).toBeNull();
  });
});
