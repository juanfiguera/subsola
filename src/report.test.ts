import { describe, expect, it } from 'vitest';
import type { Feature, Geometry } from 'geojson';
import type { PermitGroupProperties, PermitRecord } from './sources/permits';
import type { PipeRun } from './scene/build';
import { labelRows, placeDotLabels } from './ui/report';
import type { ServiceLine } from './scene/services';
import type { ServiceLot } from './sources/services';
import { buildLotReport, type LotReportInput } from './report';

const lot: ServiceLot = {
  bbl: '4006530001',
  source: 'serviceLines',
  address: '25-87 37 STREET',
  material: 'lead',
  basis: 'Records',
  cityOwned: false,
  lot: { type: 'MultiPolygon', coordinates: [] },
};

// The lot line is at x = 0; the street runs north-south east of it.
const water: ServiceLine = {
  ref: 'svc-0',
  utility: 'water',
  a: [11, 0],
  b: [0, 0],
  depthFt: 3.4,
  lot,
};

const run = (ref: string, utility: PipeRun['utility'], x: number): PipeRun => ({
  ref,
  utility,
  path: [
    [x, -50],
    [x, 50],
  ],
  depthFt: 3.4,
  digSpots: 0,
});

const permit = (permitNumber: string, issued: string, permittee: string): PermitRecord => ({
  permitNumber,
  utility: 'water',
  type: 'PLUMBING',
  permittee,
  issued,
  workStart: undefined,
  workEnd: undefined,
  status: undefined,
  street: '37 STREET',
  purpose: undefined,
  locationNote: undefined,
  mentionsMain: false,
  dataset: 'permitsCurrent',
});

const group = (permits: PermitRecord[]): Feature<Geometry, PermitGroupProperties> => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [] },
  properties: {
    key: 'test-block',
    utility: 'water',
    count: permits.length,
    firstYear: 2019,
    lastYear: 2024,
    mainCount: 0,
    permits,
    geometryKind: 'segment',
  },
});

const input = (overrides: Partial<LotReportInput> = {}): LotReportInput => ({
  bbl: lot.bbl,
  services: [water, { ...water, ref: 'svc-1', lot: { ...lot, bbl: '4006530002' } }],
  connectionPermits: new Map([[lot.bbl, []]]),
  runs: [run('permit-0', 'water', 11), run('permit-1', 'water', 30), run('permit-2', 'gas', 8)],
  groups: [
    group([
      permit('A', '2019-03-01', 'BALKAN'),
      permit('B', '2024-05-01', 'MASPETH'),
      permit('C', '2021-01-01', 'BALKAN'),
    ]),
    group([permit('D', '2025-01-01', 'FAR')]),
    group([]),
  ],
  active: [],
  digSpots: [],
  fixtures: [],
  ...overrides,
});

describe('buildLotReport', () => {
  it('measures from the water service where there is one, whatever the frontage says', () => {
    const report = buildLotReport(
      input({ frontage: { point: [-100, 0], from: 'building', street: 'N BANNOCK ST' } }),
    );
    expect(report.lotLine).toEqual({ point: [0, 0], from: 'service' });
  });

  it("measures from the building's frontage when no service places the lot line", () => {
    // The address point sits 60 m back from the street, which runs along x = 70.
    const report = buildLotReport(
      input({
        services: [],
        runs: [run('permit-0', 'water', 70)],
        frontage: { point: [62, 0], from: 'building', street: 'N BANNOCK ST' },
      }),
    );
    expect(report.lotLine.from).toBe('building');
    expect(report.mains.map((m) => [m.ref, Math.round(m.distanceM)])).toEqual([['permit-0', 8]]);
  });

  it('finds nothing out front from a far address point without a frontage', () => {
    const report = buildLotReport(input({ services: [], runs: [run('permit-0', 'water', 70)] }));
    expect(report.lotLine).toEqual({ point: [0, 0], from: 'address' });
    expect(report.mains).toEqual([]);
  });

  it("finds the searched lot's own water service, not a neighbor's", () => {
    expect(buildLotReport(input()).water?.ref).toBe('svc-0');
  });

  it('keeps the nearest line of each utility out front, nearest first', () => {
    const { mains } = buildLotReport(input());
    expect(mains.map((m) => [m.utility, m.ref])).toEqual([
      ['gas', 'permit-2'],
      ['water', 'permit-0'],
    ]);
    expect(mains[1]?.distanceM).toBeCloseTo(11);
  });

  it('gives a surveyed main its own row, beside the water line that serves the lot', () => {
    const main = {
      id: 'dc-1',
      utility: 'water' as const,
      depthFt: null,
      use: null,
      address: null,
      source: 'dcMains' as const,
      diameterIn: 30,
      material: 'Cast iron',
      installedYear: 1923,
      line: { type: 'MultiLineString' as const, coordinates: [] },
    };
    const { mains } = buildLotReport(
      input({ runs: [...input().runs, { ...run('main-0', 'water', 6), surveyed: main }] }),
    );
    expect(mains.map((m) => [m.ref, m.surveyed?.diameterIn])).toEqual([
      ['main-0', 30],
      ['permit-2', undefined],
      ['permit-0', undefined],
    ]);
  });

  it('lists a storm drain and recycled water apart from the sewer and water main', () => {
    const mapped = (
      id: string,
      utility: 'water' | 'sewer',
      use: string,
      source: 'sdSewers' | 'sdStormDrains' | 'sdWaterMains' | 'sdRecycledMains',
    ) => ({
      id,
      utility,
      depthFt: null,
      use,
      address: null,
      source,
      diameterIn: 8,
      material: null,
      installedYear: null,
      line: { type: 'MultiLineString' as const, coordinates: [] },
    });
    const { mains } = buildLotReport(
      input({
        runs: [
          { ...run('main-0', 'sewer', 9), surveyed: mapped('s', 'sewer', 'sanitary', 'sdSewers') },
          {
            ...run('main-1', 'sewer', 4),
            surveyed: mapped('d', 'sewer', 'storm', 'sdStormDrains'),
          },
          {
            ...run('main-2', 'water', 7),
            surveyed: mapped('w', 'water', 'distribution', 'sdWaterMains'),
          },
          {
            ...run('main-3', 'water', 5),
            surveyed: mapped('r', 'water', 'recycled', 'sdRecycledMains'),
          },
        ],
      }),
    );
    expect(mains.map((m) => m.surveyed?.source)).toEqual([
      'sdStormDrains',
      'sdRecycledMains',
      'sdWaterMains',
      'sdSewers',
    ]);
  });

  it("finds the building's side sewer by its address, and keeps it out of the mains", () => {
    const sewer = (id: string, use: string, address: string | null) => ({
      id,
      utility: 'sewer' as const,
      depthFt: use === 'side' ? null : 9.5,
      use,
      address,
      source: use === 'side' ? ('sfSideSewers' as const) : ('sfSewerMains' as const),
      diameterIn: use === 'side' ? 6 : 12,
      material: 'Vitrified clay',
      installedYear: null,
      line: { type: 'MultiLineString' as const, coordinates: [] },
    });
    const report = buildLotReport(
      input({
        address: '2350 29TH AVE',
        runs: [
          { ...run('main-0', 'sewer', 8), surveyed: sewer('sf-1', 'combined', null) },
          {
            ...run('main-1', 'sewer', 2),
            surveyed: sewer('sf-side-1', 'side', '2350 29th Avenue'),
          },
          { ...run('main-2', 'sewer', 3), surveyed: sewer('sf-side-2', 'side', '2352 29TH AVE') },
        ],
      }),
    );
    expect(report.sideSewer?.id).toBe('sf-side-1');
    expect(report.mains.map((m) => [m.ref, m.utility])).toEqual([['main-0', 'sewer']]);
  });

  it('takes the nearest Los Angeles house connection, which records no address', () => {
    const connection = (ref: string, y: number): PipeRun => ({
      ref,
      utility: 'sewer',
      path: [
        [12, y],
        [3, y],
      ],
      depthFt: 4,
      digSpots: 0,
      surveyed: {
        id: ref,
        utility: 'sewer',
        depthFt: null,
        use: 'side',
        address: null,
        source: 'laSideSewers',
        diameterIn: null,
        material: null,
        installedYear: null,
        line: { type: 'MultiLineString', coordinates: [] },
      },
    });
    const near = buildLotReport(
      input({ services: [], runs: [connection('main-0', 14), connection('main-1', -2)] }),
    );
    expect(near.nearbySideSewer?.main.id).toBe('main-1');
    expect(near.nearbySideSewer?.distanceM).toBeCloseTo(Math.hypot(3, 2));
    expect(near.mains).toEqual([]);
    const far = buildLotReport(input({ services: [], runs: [connection('main-0', 40)] }));
    expect(far.nearbySideSewer).toBeNull();
  });

  it("takes Seattle's side sewer nearest the address point, which files none by address", () => {
    const side = (id: string) => ({
      id,
      utility: 'sewer' as const,
      depthFt: null,
      use: 'side',
      address: null,
      source: 'seaSideSewers' as const,
      diameterIn: 6,
      material: 'PVC',
      installedYear: 1998,
      line: { type: 'MultiLineString' as const, coordinates: [] },
    });
    const sideRun = (id: string, x: number) => ({ ...run(id, 'sewer', x), surveyed: side(id) });
    const near = buildLotReport(
      input({ address: '2827 NW 75TH ST', runs: [sideRun('seas-2', 9), sideRun('seas-1', -4)] }),
    );
    expect(near.sideSewer?.id).toBe('seas-1');
    expect(near.mains).toEqual([]);
    const far = buildLotReport(
      input({ address: '2827 NW 75TH ST', runs: [sideRun('seas-3', 20)] }),
    );
    expect(far.sideSewer).toBeNull();
  });

  it('ranks who dug the block by how often, and lists its newest permits first', () => {
    const report = buildLotReport(input());
    expect(report.mains.find((m) => m.utility === 'water')?.permittees).toEqual([
      'BALKAN',
      'MASPETH',
    ]);
    expect(report.recent.map((p) => p.permitNumber)).toEqual(['B', 'C', 'A']);
  });

  it('measures from the geocoded point when DEP has no service line for the lot', () => {
    const report = buildLotReport(input({ services: [] }));
    expect(report.water).toBeNull();
    expect(report.mains.find((m) => m.utility === 'water')?.distanceM).toBeCloseTo(11);
  });

  it('reports the nearest fixture of each kind', () => {
    const { fixtures } = buildLotReport(
      input({
        fixtures: [
          { kind: 'hydrant', title: 'Fire hydrant', position: [0, 40] },
          { kind: 'hydrant', title: 'Fire hydrant', position: [0, 12] },
        ],
      }),
    );
    expect(fixtures).toEqual([{ kind: 'hydrant', title: 'Fire hydrant', distanceM: 12 }]);
  });
});

describe('labelRows', () => {
  it('drops a label to the next row only when it would overlap', () => {
    // Electric and telecom 40 px apart with 180 px labels; water far to the right.
    const rows = labelRows([
      { x: 200, width: 180 },
      { x: 600, width: 100 },
      { x: 240, width: 180 },
    ]);
    expect(rows).toEqual([0, 0, 1]);
  });

  it('reuses the top row once a label clears the ones before it', () => {
    const rows = labelRows([
      { x: 100, width: 100 },
      { x: 150, width: 100 },
      { x: 300, width: 100 },
    ]);
    expect(rows).toEqual([0, 1, 0]);
  });
});

describe('placeDotLabels', () => {
  const plot = { x0: 70, x1: 680, y0: 38, y1: 260 };

  it('puts a lone label right of its dot', () => {
    expect(placeDotLabels([{ x: 200, y: 100, width: 60 }], [], plot)).toEqual([
      { x: 212, y: 104, anchor: 'start' },
    ]);
  });

  it('flips a label left at the plot edge', () => {
    const [label] = placeDotLabels([{ x: 640, y: 100, width: 80 }], [], plot);
    expect(label!.anchor).toBe('end');
  });

  it('keeps labels of neighboring dots off each other and off the next bar', () => {
    // San Diego's Broadway: gas at the lot line, telecom and electric a few feet out.
    const dots = [
      { x: 74, y: 70, width: 92 },
      { x: 130, y: 70, width: 125 },
      { x: 140, y: 82, width: 92 },
    ];
    const bars = [
      { x: 74, y0: 70, y1: 130 },
      { x: 130, y0: 70, y1: 170 },
      { x: 140, y0: 82, y1: 170 },
    ];
    const placed = placeDotLabels(dots, bars, plot);
    const boxes = placed.map((label, index) => {
      const width = dots[index]!.width;
      const x0 = label.anchor === 'start' ? label.x : label.x - width;
      return { x0, x1: x0 + width, y0: label.y - 11, y1: label.y + 3 };
    });
    for (const [i, a] of boxes.entries()) {
      expect(a.x0).toBeGreaterThanOrEqual(plot.x0);
      for (const b of boxes.slice(i + 1))
        expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1).toBe(false);
    }
  });
});
