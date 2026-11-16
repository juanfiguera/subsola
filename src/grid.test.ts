import { describe, expect, it } from 'vitest';
import { boxOfCoordinates, gridCellBounds, gridCellOf, gridCellsInBox } from './grid';

describe('city grid', () => {
  it('puts a point inside the bounds of its own cell', () => {
    const point = [-73.91477, 40.766532];
    const [west, south, east, north] = gridCellBounds(gridCellOf(point));
    expect(point[0]).toBeGreaterThanOrEqual(west);
    expect(point[0]).toBeLessThan(east);
    expect(point[1]).toBeGreaterThanOrEqual(south);
    expect(point[1]).toBeLessThan(north);
  });

  it('gives neighboring points across a cell edge different keys', () => {
    const [, , east] = gridCellBounds(gridCellOf([-73.95, 40.7]));
    expect(gridCellOf([east - 1e-7, 40.7]).key).not.toBe(gridCellOf([east + 1e-7, 40.7]).key);
  });

  it('lists every cell a box touches', () => {
    const cell = gridCellOf([-73.95, 40.7]);
    const [west, south, east, north] = gridCellBounds(cell);
    const middle = [(west + east) / 2, (south + north) / 2] as const;
    expect(gridCellsInBox([middle[0], middle[1], middle[0], middle[1]])).toHaveLength(1);
    // Reaching just past the north-east corner takes in three more cells.
    expect(gridCellsInBox([middle[0], middle[1], east + 1e-6, north + 1e-6])).toHaveLength(4);
  });

  it('boxes nested coordinates', () => {
    expect(
      boxOfCoordinates([
        [
          [
            [1, 5],
            [3, 2],
          ],
        ],
        [[[-1, 4]]],
      ]),
    ).toEqual([-1, 2, 3, 5]);
  });
});
