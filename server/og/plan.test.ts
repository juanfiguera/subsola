import { describe, expect, it } from 'vitest';
import type { StreetSegment } from '../../src/sources/streets';
import { createFrame } from '../../src/scene/local';
import { nearestStreetName, streetIsNear } from './plan';

const frame = createFrame([-74.0, 40.7]);

/** A street running north-south `eastM` meters east of the spot. */
const street = (label: string, permitName: string, eastM: number): StreetSegment => ({
  label,
  permitName,
  borough: 'MANHATTAN',
  geometry: {
    type: 'MultiLineString',
    coordinates: [
      [frame.toLngLat([eastM, -100]), frame.toLngLat([eastM, 100])] as [number, number][],
    ],
  },
});

const STREETS = [
  street('WEST ST', 'WEST STREET', 20),
  street('GREENWICH ST', 'GREENWICH STREET', 150),
];

describe('streetIsNear', () => {
  it('accepts the typed street when the city files one by that name close by', () => {
    expect(streetIsNear('West St', STREETS, frame)).toBe(true);
    expect(streetIsNear('west street', STREETS, frame)).toBe(true);
  });

  it('refuses a street that is too far off, or not there at all', () => {
    expect(streetIsNear('Greenwich St', STREETS, frame)).toBe(false);
    expect(streetIsNear('Free money call now', STREETS, frame)).toBe(false);
  });
});

describe('nearestStreetName', () => {
  it('names the closest street', () => {
    expect(nearestStreetName(STREETS, frame)).toBe('WEST ST');
  });

  it('names none when every street is far', () => {
    expect(nearestStreetName([street('FAR ST', 'FAR STREET', 500)], frame)).toBeNull();
  });
});
