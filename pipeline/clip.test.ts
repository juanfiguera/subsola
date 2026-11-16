import { describe, expect, it } from 'vitest';
import { clipLine, clipPolygon, clipRing, type Box } from './clip';

const box: Box = [0, 0, 10, 10];
const area = (ring: number[][]) =>
  Math.abs(
    ring.slice(1).reduce((sum, p, i) => sum + ring[i]![0]! * p[1]! - p[0]! * ring[i]![1]!, 0) / 2,
  );

describe('clipRing', () => {
  it('keeps a ring that is already inside', () => {
    const ring = [
      [1, 1],
      [4, 1],
      [4, 4],
      [1, 1],
    ];
    expect(clipRing(ring, box)).toEqual(ring);
  });

  it('cuts a square hanging over a corner to the overlap', () => {
    const ring = [
      [5, 5],
      [15, 5],
      [15, 15],
      [5, 15],
      [5, 5],
    ];
    expect(area(clipRing(ring, box))).toBeCloseTo(25);
  });

  it('drops a ring entirely outside', () => {
    expect(
      clipRing(
        [
          [20, 20],
          [30, 20],
          [30, 30],
          [20, 20],
        ],
        box,
      ),
    ).toEqual([]);
  });
});

describe('clipPolygon', () => {
  it('drops holes that fall outside and the polygon when the outer ring does', () => {
    const outer = [
      [-5, -5],
      [15, -5],
      [15, 15],
      [-5, 15],
      [-5, -5],
    ];
    const holeOutside = [
      [12, 12],
      [13, 12],
      [13, 13],
      [12, 12],
    ];
    expect(clipPolygon([outer, holeOutside], box)).toHaveLength(1);
    expect(
      clipPolygon(
        [
          [
            [20, 20],
            [30, 20],
            [30, 30],
            [20, 20],
          ],
        ],
        box,
      ),
    ).toEqual([]);
  });
});

describe('clipLine', () => {
  it('cuts a line crossing the box to the part inside', () => {
    expect(
      clipLine(
        [
          [-5, 5],
          [15, 5],
        ],
        box,
      ),
    ).toEqual([
      [
        [0, 5],
        [10, 5],
      ],
    ]);
  });

  it('splits a line that leaves and comes back into two runs', () => {
    const runs = clipLine(
      [
        [2, 2],
        [12, 2],
        [12, 8],
        [2, 8],
      ],
      box,
    );
    expect(runs).toEqual([
      [
        [2, 2],
        [10, 2],
      ],
      [
        [10, 8],
        [2, 8],
      ],
    ]);
  });
});
