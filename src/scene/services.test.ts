import { describe, expect, it } from 'vitest';
import type { ServiceLot } from '../sources/services';
import type { PipeRun } from './build';
import type { LocalFrame, Vec2 } from './local';
import { CURB_VALVE_FROM_CURB_M, buildServices, curbValveOn } from './services';

// Coordinates in these tests are already local meters.
const frame: LocalFrame = {
  origin: [0, 0],
  toLocal: (p) => [p[0]!, p[1]!],
  toLngLat: (p) => p,
};

const lotAt = (x0: number, y0: number, x1: number, y1: number): ServiceLot => ({
  bbl: '1',
  source: 'serviceLines',
  address: '1 TEST STREET',
  material: 'lead',
  basis: 'Records',
  cityOwned: false,
  lot: {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
          [x0, y0],
        ],
      ],
    ],
  },
});

const main = (path: Vec2[], utility: PipeRun['utility'] = 'water'): PipeRun => ({
  ref: 'permit-0',
  utility,
  path,
  depthFt: 3.4,
  digSpots: 0,
});

describe('buildServices', () => {
  const street = main([
    [-50, 0],
    [50, 0],
  ]);

  it('runs square from the main to the middle of the lot front', () => {
    const [line] = buildServices(frame, [lotAt(10, 8, 18, 30)], [street], []);
    expect(line?.a[1]).toBeCloseTo(0);
    expect(line?.b[1]).toBeCloseTo(8);
    expect(line?.a[0]).toBeCloseTo(line!.b[0]);
    expect(line?.depthFt).toBe(3.4);
    expect(line?.lot.material).toBe('lead');
  });

  it('skips lots too far from any water main', () => {
    expect(buildServices(frame, [lotAt(10, 40, 18, 60)], [street], [])).toEqual([]);
  });

  it("reaches farther for San Diego's points inside the lot, and draws no house sewer", () => {
    const point = { ...lotAt(10, 38, 12, 40), source: 'sdServiceLines' as const };
    const sewer = main(
      [
        [-50, 1],
        [50, 1],
      ],
      'sewer',
    );
    const lines = buildServices(frame, [point], [street, sewer], []);
    expect(lines.map((line) => line.utility)).toEqual(['water']);
    expect(lines[0]?.b[1]).toBeCloseTo(38);
    expect(buildServices(frame, [lotAt(10, 38, 12, 40)], [street], [])).toEqual([]);
  });

  it('draws a Seattle service from its mapped tap to the meter, and none with no main there', () => {
    const meter = { ...lotAt(10, 14, 12, 16), source: 'seaServiceLines' as const };
    const [line, ...rest] = buildServices(
      frame,
      [{ ...meter, tap: [20, 0.5] }],
      [
        street,
        main(
          [
            [-50, 30],
            [50, 30],
          ],
          'sewer',
        ),
      ],
      [],
    );
    expect(rest).toEqual([]);
    expect(line?.utility).toBe('water');
    expect(line?.a[0]).toBeCloseTo(20);
    expect(line?.a[1]).toBeCloseTo(0);
    expect(line?.b[1]).toBeCloseTo(14);
    expect(buildServices(frame, [{ ...meter, tap: [20, 40] }], [street], [])).toEqual([]);
  });

  it('only connects to water and sewer', () => {
    const gas = main(
      [
        [-50, 0],
        [50, 0],
      ],
      'gas',
    );
    expect(buildServices(frame, [lotAt(10, 8, 18, 30)], [gas], [])).toEqual([]);
  });

  it('gives the lot a house sewer beside its water service', () => {
    const sewer = {
      ...main(
        [
          [-50, -3],
          [50, -3],
        ],
        'sewer',
      ),
      depthFt: 5,
    };
    const [water, house] = buildServices(frame, [lotAt(10, 8, 18, 30)], [street, sewer], []);
    expect(house?.utility).toBe('sewer');
    expect(house?.depthFt).toBe(5);
    expect(house?.a[1]).toBeCloseTo(-3);
    expect(house?.b[1]).toBeCloseTo(8);
    expect(Math.abs(house!.b[0] - water!.b[0])).toBeCloseTo(2);
  });
});

describe('curbValveOn', () => {
  // Curbs on both sides of a street running east-west, 5 m either side of center.
  const curbs: Vec2[][] = [
    [
      [-50, 5],
      [50, 5],
    ],
    [
      [-50, -5],
      [50, -5],
    ],
  ];

  it('sits 18 inches past the curb nearest the lot', () => {
    const valve = curbValveOn([12, -1], [12, 8], curbs);
    expect(valve?.[0]).toBeCloseTo(12);
    expect(valve?.[1]).toBeCloseTo(5 + CURB_VALVE_FROM_CURB_M);
  });

  it('uses the lot-side curb when the line crosses the whole street', () => {
    const valve = curbValveOn([12, -8], [12, 8], curbs);
    expect(valve?.[1]).toBeCloseTo(5 + CURB_VALVE_FROM_CURB_M);
  });

  it('is missing when no curb is crossed', () => {
    expect(curbValveOn([12, -1], [12, 4], curbs)).toBeUndefined();
  });
});
