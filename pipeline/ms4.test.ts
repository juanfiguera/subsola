import { describe, expect, it } from 'vitest';
import { inPolygon } from '../src/geo';
import { loadStormAreas, stormAreaLocator } from './ms4';

const square = (x0: number, y0: number, size: number) => [
  [x0, y0],
  [x0 + size, y0],
  [x0 + size, y0 + size],
  [x0, y0 + size],
  [x0, y0],
];

describe('inPolygon', () => {
  it('counts the inside but not a hole', () => {
    const polygon = [square(0, 0, 10), square(4, 4, 2)];
    expect(inPolygon([1, 1], polygon)).toBe(true);
    expect(inPolygon([5, 5], polygon)).toBe(false);
    expect(inPolygon([11, 1], polygon)).toBe(false);
  });
});

describe('stormAreaLocator', () => {
  it('names the outfall of the area a point is in', () => {
    const locate = stormAreaLocator([
      {
        properties: { outfall: 'A-1', water: 'EAST RIVER' },
        geometry: { coordinates: [[square(0, 0, 10)]] },
      },
    ]);
    expect(locate([5, 5])).toEqual({ outfall: 'A-1', water: 'EAST RIVER' });
    expect(locate([15, 5])).toBeNull();
  });

  // Reads the whole citywide map, which passes 5 seconds when the machine is busy.
  it(
    'finds the north end of West St, Greenpoint, in the area draining to NCB-024',
    { timeout: 30_000 },
    async () => {
      const locate = await loadStormAreas();
      expect(locate([-73.9596, 40.7354])?.outfall).toBe('NCB-024');
      expect(locate([-73.959, 40.7298])).toBeNull();
    },
  );
});
