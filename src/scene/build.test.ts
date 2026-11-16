import { describe, expect, it } from 'vitest';
import type { Feature, Geometry } from 'geojson';
import type { PermitGroupProperties } from '../sources/permits';
import { buildPipes, buildSurveyedMains, lanesFromDigSpots } from './build';
import type { DigSpot } from './digSpots';
import { createFrame, type Vec2 } from './local';

const frame = createFrame([-73.9, 40.75]);

// A gas block running east along y = 0, 100 m long.
const block: Feature<Geometry, PermitGroupProperties> = {
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [frame.toLngLat([0, 0]), frame.toLngLat([100, 0])],
  },
  properties: {
    key: 'test-block',
    utility: 'gas',
    count: 3,
    firstYear: 2019,
    lastYear: 2024,
    mainCount: 0,
    permits: [],
    geometryKind: 'segment',
  },
};

const spot = (position: Vec2): DigSpot => ({
  ref: `dig-${position.join(',')}`,
  permitRef: 'permit-0',
  utility: 'gas',
  position,
  note: '',
  permitNumber: '',
  issued: undefined,
});

describe('lanesFromDigSpots', () => {
  it('moves the lane to the median dig, south of an eastbound block being its right', () => {
    const lanes = lanesFromDigSpots(
      frame,
      [block],
      [spot([20, -2]), spot([50, -3]), spot([80, -9])],
    );
    expect(lanes.get('permit-0')?.lateralM).toBeCloseTo(3);
    expect(lanes.get('permit-0')?.digSpots).toBe(3);
  });

  it('drops digs past the ends of the block or too far out to be the main', () => {
    const lanes = lanesFromDigSpots(
      frame,
      [block],
      [spot([-6, 2]), spot([-8, 2]), spot([50, 20]), spot([60, 20])],
    );
    expect(lanes.size).toBe(0);
  });

  it('needs two notes to move a lane', () => {
    expect(lanesFromDigSpots(frame, [block], [spot([50, -3])]).size).toBe(0);
  });

  it("pushes another utility's lane aside when a placed lane lands on it", () => {
    // Water sits 1.5 m right of travel by default, so south of this eastbound block. The gas
    // notes come from a copy of the block drawn the other way and land 1 m south of the water.
    const water = { ...block, properties: { ...block.properties, utility: 'water' as const } };
    const reversed = {
      ...block,
      geometry: {
        type: 'LineString' as const,
        coordinates: [frame.toLngLat([100, 0]), frame.toLngLat([0, 0])],
      },
    };
    const lanes = lanesFromDigSpots(frame, [reversed, water], [spot([30, -2.5]), spot([70, -2.5])]);
    // Westbound, so the gas lane's right is north: 2.5 m south reads as -2.5.
    expect(lanes.get('permit-0')).toEqual({ lateralM: -2.5, digSpots: 2 });
    // Water is pushed 1.2 m north of the gas, keeping no dig count of its own.
    expect(lanes.get('permit-1')?.lateralM).toBeCloseTo(1.3);
    expect(lanes.get('permit-1')?.digSpots).toBe(0);
  });

  it('moves every gas group on a block filed twice into one lane', () => {
    const twin = { ...block, properties: { ...block.properties } };
    const lanes = lanesFromDigSpots(frame, [block, twin], [spot([30, -3]), spot([70, -3])]);
    expect(lanes.get('permit-0')?.lateralM).toBeCloseTo(3);
    expect(lanes.get('permit-1')).toEqual(lanes.get('permit-0'));
  });
});

describe('buildPipes', () => {
  it('keeps the default spacing without notes and uses the placement with them', () => {
    const [spaced] = buildPipes(frame, [block]).runs;
    expect(spaced?.digSpots).toBe(0);
    // Gas sits 3 m left of travel by default, so north of an eastbound block.
    expect(spaced?.path[0]?.[1]).toBeCloseTo(3);

    const [placed] = buildPipes(
      frame,
      [block],
      new Map([['permit-0', { lateralM: 2, digSpots: 4 }]]),
    ).runs;
    expect(placed?.digSpots).toBe(4);
    expect(placed?.path[0]?.[1]).toBeCloseTo(-2);
  });
});

describe('buildSurveyedMains', () => {
  const main = (diameterIn: number | null) => ({
    id: 'dc-1',
    utility: 'water' as const,
    depthFt: null,
    use: null,
    address: null,
    source: 'dcMains' as const,
    diameterIn,
    material: 'Cast iron',
    installedYear: 1923,
    line: {
      type: 'MultiLineString' as const,
      coordinates: [
        [
          [-73.9, 40.75],
          [-73.899, 40.75],
        ],
      ],
    },
  });

  it('keeps the surveyed route, with no lane offset', () => {
    const [run] = buildSurveyedMains(frame, [main(30)]);
    expect(run?.ref).toBe('main-0');
    expect(run?.path[0]?.[1]).toBeCloseTo(0);
    expect(run?.surveyed?.diameterIn).toBe(30);
  });

  it('draws a bigger main bigger, and an unsized one at the usual size', () => {
    const [small] = buildSurveyedMains(frame, [main(16)]);
    const [large] = buildSurveyedMains(frame, [main(48)]);
    const [unsized] = buildSurveyedMains(frame, [main(null)]);
    expect(large!.radiusM!).toBeGreaterThan(small!.radiusM!);
    expect(unsized?.radiusM).toBeUndefined();
  });
});
