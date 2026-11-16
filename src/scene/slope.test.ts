import { describe, expect, it } from 'vitest';
import { compassOf, groundLookup, sewerFlow } from './slope';

// A block running east along y = 0, with the ground falling toward the west end.
const ground = groundLookup([
  { position: [0, 0], elevationFt: 11 },
  { position: [100, 0], elevationFt: 16 },
  { position: [500, 500], elevationFt: 99 },
]);

describe('groundLookup', () => {
  it('reads the nearest spot within reach and nothing past it', () => {
    expect(ground.at([5, 4])).toBe(11);
    expect(ground.at([95, -6])).toBe(16);
    expect(ground.at([50, 0])).toBeNull();
  });
});

describe('sewerFlow', () => {
  it('drains downhill, against the path when the path runs uphill', () => {
    const flow = sewerFlow(
      [
        [2, 3],
        [98, 3],
      ],
      ground,
    );
    expect(flow).toMatchObject({ direction: -1, highFt: 16, lowFt: 11 });
    expect(compassOf(flow!.downhill)).toBe('west');
  });

  it('gives no direction when the street is about level or a spot is missing', () => {
    const level = groundLookup([
      { position: [0, 0], elevationFt: 12 },
      { position: [100, 0], elevationFt: 12.3 },
    ]);
    const path: [number, number][] = [
      [0, 0],
      [100, 0],
    ];
    expect(sewerFlow(path, level)).toBeUndefined();
    expect(
      sewerFlow(
        [
          [0, 0],
          [50, 0],
        ],
        ground,
      ),
    ).toBeUndefined();
  });

  it('calls half a foot over a block, the fall of a flat but sloped street', () => {
    const gentle = groundLookup([
      { position: [0, 0], elevationFt: 12 },
      { position: [75, 0], elevationFt: 12.5 },
    ]);
    const path: [number, number][] = [
      [0, 0],
      [75, 0],
    ];
    expect(sewerFlow(path, gentle)?.direction).toBe(-1);
  });

  it('fits the spots along a run when its ends land between them', () => {
    // Spots every 60 m along a street falling east; the run starts and ends 45 m from any.
    const street = groundLookup(
      [0, 60, 120, 180, 240].map((x) => ({
        position: [x, 0] as [number, number],
        elevationFt: 30 - x / 30,
      })),
    );
    const path: [number, number][] = [
      [-45, 4],
      [285, 4],
    ];
    expect(street.at(path[0]!)).toBeNull();
    const flow = sewerFlow(path, street);
    expect(flow?.direction).toBe(1);
    expect(flow?.highFt).toBeCloseTo(31.5);
    expect(flow?.lowFt).toBeCloseTo(20.5);
  });

  it('does not fit from spots bunched at one end of a run', () => {
    const bunched = groundLookup([
      { position: [0, 0], elevationFt: 10 },
      { position: [10, 0], elevationFt: 14 },
    ]);
    expect(
      bunched.along([
        [-40, 0],
        [200, 0],
      ]),
    ).toBeNull();
  });
});

describe('compassOf', () => {
  it('names the eight directions with y north', () => {
    expect(compassOf([0, 1])).toBe('north');
    expect(compassOf([-1, -1])).toBe('southwest');
    expect(compassOf([1, 0])).toBe('east');
  });
});
