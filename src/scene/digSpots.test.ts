import { describe, expect, it } from 'vitest';
import { parseLocationNote } from '../sources/locationNotes';
import type { Vec2 } from './local';
import { resolveDigSpot, type NamedStreet } from './digSpots';

// 37 Street runs north-south along x = 0 and 28 Avenue east-west along y = 0, both 10 m
// curb to curb, so every curb is 5 m from its centerline.
const streets: NamedStreet[] = [
  {
    permitName: '37 STREET',
    paths: [
      [
        [0, -100],
        [0, 100],
      ],
    ],
  },
  {
    permitName: '28 AVENUE',
    paths: [
      [
        [-100, 0],
        [100, 0],
      ],
    ],
  },
];
const curbs: Vec2[][] = [
  [
    [5, -100],
    [5, 100],
  ],
  [
    [-5, -100],
    [-5, 100],
  ],
  [
    [-100, 5],
    [100, 5],
  ],
  [
    [-100, -5],
    [100, -5],
  ],
];
const FOOT = 0.3048;

describe('resolveDigSpot', () => {
  it('measures each distance from the named curb', () => {
    const spot = resolveDigSpot(
      parseLocationNote("0' NNC OF 28 AVE & 4' WEC OF 37TH ST"),
      streets,
      curbs,
    );
    expect(spot?.[0]).toBeCloseTo(5 - 4 * FOOT);
    expect(spot?.[1]).toBeCloseTo(5);
  });

  it('runs past the curb when the note says so', () => {
    const spot = resolveDigSpot(
      parseLocationNote("30' SSC OF 28 AVE & 0' EWC OF 37 ST"),
      streets,
      curbs,
    );
    expect(spot?.[0]).toBeCloseTo(-5);
    expect(spot?.[1]).toBeCloseTo(-5 - 30 * FOOT);
  });

  it('gives up on one offset, an unknown street, or a curb the street has no side for', () => {
    expect(resolveDigSpot(parseLocationNote("4' WEC OF 37TH ST"), streets, curbs)).toBeNull();
    expect(
      resolveDigSpot(parseLocationNote("0' NNC OF 31 AVE & 4' WEC OF 37 ST"), streets, curbs),
    ).toBeNull();
    expect(
      resolveDigSpot(parseLocationNote("0' NNC OF 37 ST & 4' WEC OF 28 AVE"), streets, curbs),
    ).toBeNull();
  });
});

describe('buildDigSpots', () => {
  const permit = (locationNote: string, permitNumber: string) => ({
    utility: 'gas' as const,
    locationNote,
    permitNumber,
    issued: '2017-03-01',
  });
  const block: Vec2[][] = [
    [
      [0, 0],
      [0, 80],
    ],
  ];

  it('keeps one spot per place and drops spots far from their block', async () => {
    const { buildDigSpots } = await import('./digSpots');
    const spots = buildDigSpots(
      [
        {
          ref: 'permit-0',
          paths: block,
          permits: [
            permit("0' NNC OF 28 AVE & 4' WEC OF 37TH ST", 'A'),
            permit("0' NNC OF 28 AVE & 4' WEC OF 37TH ST", 'A'),
            permit("200' SSC OF 28 AVE & 0' EWC OF 37 ST", 'B'),
          ],
        },
      ],
      streets,
      curbs,
    );
    expect(spots.map((s) => s.permitNumber)).toEqual(['A']);
    expect(spots[0]?.permitRef).toBe('permit-0');
  });
});
