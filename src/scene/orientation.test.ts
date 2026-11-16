import { describe, expect, it } from 'vitest';
import type { Vec2 } from './local';
import { gridBearing } from './orientation';

/** A street through the origin running `bearing` degrees clockwise from north. */
const street = (bearing: number, offset: Vec2 = [0, 0]): Vec2[] => {
  const radians = (bearing * Math.PI) / 180;
  const [dx, dy] = [Math.sin(radians) * 100, Math.cos(radians) * 100];
  return [
    [offset[0] - dx, offset[1] - dy],
    [offset[0] + dx, offset[1] + dy],
  ];
};

describe('gridBearing', () => {
  it("turns Manhattan's grid, avenues 29 degrees east of north, straight up", () => {
    const grid = [street(29), street(29, [60, -30]), street(119), street(119, [20, 50])];
    expect(gridBearing(grid, [0, 0])).toBeCloseTo(29);
  });

  it('keeps a north-south grid as it is and takes the short way round', () => {
    expect(gridBearing([street(0), street(90)], [0, 0])).toBeCloseTo(0);
    expect(gridBearing([street(-20), street(70)], [0, 0])).toBeCloseTo(-20);
  });

  it('lets the grid outvote one diagonal street', () => {
    const grid = [street(29), street(29, [60, -30]), street(119), street(119, [20, 50]), street(5)];
    expect(gridBearing(grid, [0, 0])).toBeGreaterThan(20);
  });

  it('stays north up where streets go every which way, or there are none', () => {
    expect(gridBearing([street(0), street(22.5), street(45), street(67.5)], [0, 0])).toBe(0);
    expect(gridBearing([], [0, 0])).toBe(0);
  });
});
