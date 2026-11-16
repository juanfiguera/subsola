import { describe, expect, it } from 'vitest';
import type { Feature, Geometry } from 'geojson';
import type { PermitGroupProperties } from '../sources/permits';
import type { StreetSegment } from '../sources/streets';
import { buildPipes } from './build';
import { continueAlongStreets, joinAtCorners } from './continuations';
import type { PipeRun } from './build';
import { createFrame, type Vec2 } from './local';

const frame = createFrame([-73.959, 40.729]);
const lngLats = (line: Vec2[]) => line.map((p) => frame.toLngLat(p) as [number, number]);

const street = (permitName: string, ...lines: Vec2[][]): StreetSegment => ({
  label: permitName,
  permitName,
  borough: 'QUEENS',
  geometry: { type: 'MultiLineString', coordinates: lines.map(lngLats) },
});

// West Street runs north in three blocks; Kent Street crosses it at y = 100.
const westBlocks: Vec2[][] = [
  [
    [0, 0],
    [0, 100],
  ],
  [
    [0, 100],
    [0, 200],
  ],
  // Drawn the other way, as the city's centerline sometimes is.
  [
    [0, 300],
    [0, 200],
  ],
];
const streets = [
  street('WEST STREET', ...westBlocks),
  street('KENT STREET', [
    [-100, 100],
    [0, 100],
  ]),
];

const waterOn = (line: Vec2[]): Feature<Geometry, PermitGroupProperties> => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: lngLats(line) },
  properties: {
    key: 'test-block',
    utility: 'water',
    count: 2,
    firstYear: 2019,
    lastYear: 2023,
    mainCount: 0,
    permits: [],
    geometryKind: 'segment',
  },
});

describe('continueAlongStreets', () => {
  const groups = [waterOn(westBlocks[0]!)];
  const { runs } = buildPipes(frame, groups);
  const continued = continueAlongStreets(frame, groups, runs, streets);

  it("carries a utility through the street's blocks with no permit, marked assumed", () => {
    expect(continued.map((run) => [run.utility, run.street, run.assumed])).toEqual([
      ['water', 'WEST STREET', true],
      ['water', 'WEST STREET', true],
    ]);
  });

  it('leaves streets the utility has no permit on alone', () => {
    expect(continued.some((run) => run.street === 'KENT STREET')).toBe(false);
  });

  it('keeps the lane of the permit block, whichever way a block is drawn', () => {
    // Water sits 1.5 m right of a northbound block: x = 1.5.
    for (const run of continued) for (const [x] of run.path) expect(x).toBeCloseTo(1.5, 5);
  });

  it('adds nothing when every block of the street has a permit', () => {
    const all = westBlocks.map(waterOn);
    const pipes = buildPipes(frame, all);
    expect(continueAlongStreets(frame, all, pipes.runs, streets)).toEqual([]);
  });
});

const run = (ref: string, path: Vec2[], utility: PipeRun['utility'] = 'water'): PipeRun => ({
  ref,
  utility,
  path,
  depthFt: 3.4,
  digSpots: 0,
});

describe('joinAtCorners', () => {
  // West Street's water ends at the Kent Street corner (0, 100) in its lane, x = 1.5; Kent
  // Street's comes in from the west in its lane, y = 98.5.
  const north = run('permit-0', [
    [1.5, 0],
    [1.5, 100],
  ]);
  const east = run('permit-1', [
    [-100, 98.5],
    [0, 98.5],
  ]);

  it('carries both ends along their lanes to where the lanes cross', () => {
    const joins = joinAtCorners(frame, [north, east], streets);
    expect(joins.map((j) => j.path.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]))).toEqual([
      [
        [1.5, 100],
        [1.5, 98.5],
      ],
      [
        [0, 98.5],
        [1.5, 98.5],
      ],
    ]);
    expect(joins.every((j) => j.assumed && j.utility === 'water')).toBe(true);
  });

  it('joins a lane that shifts on the same street with a short jog', () => {
    const next = run('permit-2', [
      [3, 100],
      [3, 200],
    ]);
    const joins = joinAtCorners(frame, [north, next], streets);
    expect(joins.map((j) => j.path)).toEqual([
      [
        [1.5, 100],
        [3, 100],
      ],
    ]);
  });

  it("never joins different utilities, or a line that doesn't reach the corner", () => {
    const gas = run(
      'permit-3',
      [
        [-100, 95],
        [0, 95],
      ],
      'gas',
    );
    const far = run('permit-4', [
      [1.5, -100],
      [1.5, 60],
    ]);
    expect(joinAtCorners(frame, [north, gas], streets)).toEqual([]);
    expect(joinAtCorners(frame, [far, east], streets)).toEqual([]);
  });
});
