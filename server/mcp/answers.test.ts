import { describe, expect, it } from 'vitest';
import type { Feature, Geometry } from 'geojson';
import {
  mapUrl,
  recentDigsAnswer,
  recentDigsOutput,
  whatsUnderAnswer,
  whatsUnderOutput,
  type RecentDigsInput,
} from './answers';
import { DC, LA, NYC, SEA, SF } from '../../src/regions';
import type { LotReport, MainOutFront } from '../../src/report';
import type { GeocodedAddress } from '../../src/sources/geocode';
import type { ServiceLot } from '../../src/sources/services';
import type { SurveyedMain } from '../../src/sources/mains';
import {
  permitGroupFeature,
  type PermitGroupProperties,
  type PermitRecord,
} from '../../src/sources/permits';
import { createFrame } from '../../src/scene/local';

const nycAddress: GeocodedAddress = {
  label: '25-87 37 STREET, Astoria',
  lngLat: [-73.9183, 40.7704],
  street: '37 STREET',
  borough: 'Queens',
  bbl: '4006530001',
};

const lot: ServiceLot = {
  bbl: '4006530001',
  source: 'serviceLines',
  address: '25-87 37 STREET',
  material: 'lead',
  basis: 'Records',
  cityOwned: false,
  lot: { type: 'MultiPolygon', coordinates: [] },
};

const permit = (overrides: Partial<PermitRecord> = {}): PermitRecord => ({
  permitNumber: 'Q01',
  utility: 'gas',
  type: 'PLUMBING',
  permittee: 'CONSOLIDATED EDISON CO. OF NEW YORK, INC.',
  issued: '2026-10-01',
  workStart: '2026-10-01',
  workEnd: '2026-12-01',
  status: undefined,
  street: '37 STREET   between 28 AVENUE and ASTORIA BOULEVARD',
  purpose: 'GAS SERVICE call 212-555-0100',
  locationNote: undefined,
  mentionsMain: false,
  dataset: 'permitsCurrent',
  ...overrides,
});

const main = (overrides: Partial<MainOutFront>): MainOutFront => ({
  utility: 'gas',
  ref: 'permit-0',
  distanceM: 10,
  digSpots: 0,
  assumed: false,
  digs: 4,
  firstYear: 2001,
  lastYear: 2026,
  permittees: ['CONSOLIDATED EDISON CO. OF NEW YORK, INC.', 'KEYSPAN ENERGY'],
  ...overrides,
});

const report = (overrides: Partial<LotReport> = {}): LotReport => ({
  lotLine: { point: [0, 0], from: 'address' },
  bbl: '4006530001',
  water: null,
  sewer: null,
  connectionPermits: [],
  mains: [],
  live: [],
  recent: [],
  digSpots: [],
  fixtures: [],
  sideSewer: null,
  nearbySideSewer: null,
  ...overrides,
});

const input = {
  asked: { requested: '25-87 37th St, Astoria', differs: false },
  builtAt: '2026-11-08T21:27:04.374Z',
  incomplete: false,
  serviceLots: [lot],
  groups: [] as Feature<Geometry, PermitGroupProperties>[],
  today: '2026-11-08',
};

describe('whatsUnderAnswer', () => {
  it('gives each line its depth standard, how it was placed and how sure that is', () => {
    const { structured, text } = whatsUnderAnswer({
      ...input,
      address: nycAddress,
      region: NYC,
      report: report({
        mains: [
          main({ digSpots: 3 }),
          main({ utility: 'electric', ref: 'run-1', distanceM: 4, assumed: true, digs: 0 }),
        ],
      }),
    });
    expect(whatsUnderOutput.parse(structured)).toEqual(structured);
    const [gas, electric] = structured.utilities;
    expect(gas).toMatchObject({
      label: 'Gas',
      distanceFromLotLineFt: 33,
      placement: 'permits',
      confidence: 'From permits',
      permitsOnBlock: 4,
      permitYears: '2001 to 2026',
      permittees: ['Consolidated Edison Co. Of New York, Inc.', 'National Grid'],
    });
    expect(gas!.depth).toMatchObject({ shallowestFt: 1.5, deepestFt: 4, basis: 'Federal minimum' });
    expect(gas!.depth.standard?.name).toContain('49 CFR');
    expect(gas!.placedBy).toContain('3 crew location notes');
    expect(electric).toMatchObject({
      placement: 'inferred',
      confidence: 'Inferred',
      permitsOnBlock: null,
    });
    expect(text).toContain(
      'Gas: about 33 ft from the lot line as drawn, expected 1 ft 6 in to 4 ft down',
    );
    expect(text).toContain('Electric: about 13 ft');
    expect(text).toContain('depth not published');
  });

  it('reads the lead status from the lot record even with no line drawn to it', () => {
    const { structured, text } = whatsUnderAnswer({
      ...input,
      address: nycAddress,
      region: NYC,
      report: report(),
    });
    expect(structured.leadServiceLine).toMatchObject({
      published: true,
      material: 'lead',
      status: 'Lead',
    });
    expect(text).toContain('Water service line (lead status): Lead.');
    expect(text).toContain('311');
    expect(structured.lot).toBe('Tax block 653, lot 1');
  });

  it('says a block with only manhole permits has no excavation permits, not "0 permits"', () => {
    const { structured, text } = whatsUnderAnswer({
      ...input,
      address: nycAddress,
      region: NYC,
      report: report({
        mains: [main({ utility: 'electric', digs: 0, firstYear: 2007, lastYear: 2008 })],
      }),
    });
    expect(structured.utilities[0]!.permitsOnBlock).toBe(0);
    expect(text).toContain(
      'No excavation permits on this block, only permits to open its manholes or use the street (2007 to 2008).',
    );
    expect(text).not.toContain('0 permits on this block');
  });

  it("says DC Water's inventory is paused for its terms, never that it has no entry", () => {
    const { structured, text } = whatsUnderAnswer({
      ...input,
      address: { ...nycAddress, label: '800 F St NW, Washington, DC', bbl: undefined },
      region: DC,
      report: report({ bbl: null }),
    });
    expect(structured.leadServiceLine).toMatchObject({ material: null, status: 'Not shown' });
    expect(structured.leadServiceLine.detail).toContain('asks DC Water for permission');
    expect(structured.leadServiceLine.detail).toContain('https://geo.dcwater.com/Lead/');
    expect(text).not.toContain('has no entry');
  });

  it("says a city doesn't publish service lines by lot rather than guessing", () => {
    const { structured } = whatsUnderAnswer({
      ...input,
      address: { ...nycAddress, label: '1420 Market St, San Francisco, CA', bbl: undefined },
      region: SF,
      report: report({ bbl: null }),
    });
    expect(structured.leadServiceLine).toMatchObject({ published: false, material: null });
    expect(structured.lot).toBeNull();
  });

  it("reads SPU's two pieces of a Seattle service and its side sewer map", () => {
    const seaLot: ServiceLot = {
      ...lot,
      bbl: '287210-0365#12',
      source: 'seaServiceLines',
      address: '2827 NW 75TH ST',
      material: 'galvanized',
      basis: 'SPU records',
      sides: {
        public: { material: 'galvanized', verified: false, pipe: 'Galvanized iron' },
        private: { material: 'non-lead', verified: false, pipe: 'Copper' },
      },
      sizeIn: 0.75,
      installedYear: 1940,
    };
    const sideSewer: SurveyedMain = {
      id: 'seas-1',
      utility: 'sewer',
      depthFt: null,
      use: 'side',
      address: null,
      source: 'seaSideSewers',
      diameterIn: 6,
      material: 'Concrete',
      installedYear: null,
      line: { type: 'MultiLineString', coordinates: [] },
    };
    const seattle = { ...nycAddress, label: '2827 NW 75TH ST, Seattle, WA', bbl: undefined };
    const { structured } = whatsUnderAnswer({
      ...input,
      serviceLots: [seaLot],
      address: seattle,
      region: SEA,
      report: report({ bbl: seaLot.bbl, sideSewer }),
    });
    expect(structured.leadServiceLine).toMatchObject({
      published: true,
      material: 'galvanized',
      status: 'Galvanized',
    });
    expect(structured.leadServiceLine.detail).toContain('Main to meter: Galvanized iron.');
    expect(structured.leadServiceLine.detail).toContain('Size: 3/4 in.');
    expect(structured.houseSewer.status).toBe('On record');
    expect(structured.houseSewer.detail).toContain('Size: 6 in.');
    expect(structured.lot).toBe('Parcel 287210-0365');

    const none = whatsUnderAnswer({
      ...input,
      serviceLots: [],
      address: seattle,
      region: SEA,
      report: report({ bbl: null }),
    }).structured;
    expect(none.leadServiceLine).toMatchObject({ published: true, status: 'No entry' });
    expect(none.houseSewer.status).toBe('Not on record');
  });

  it('gives a surveyed main its measured depth and its publisher', () => {
    const surveyed: SurveyedMain = {
      id: 'm1',
      utility: 'water',
      depthFt: 6.5,
      use: null,
      address: null,
      source: 'dcMains',
      diameterIn: 16,
      material: 'Cast iron',
      installedYear: 1900,
      line: { type: 'MultiLineString', coordinates: [] },
    };
    const { structured, text } = whatsUnderAnswer({
      ...input,
      address: { ...nycAddress, label: '800 F ST NW, Washington, DC', bbl: '0406 0809' },
      region: DC,
      report: report({ bbl: '0406 0809', mains: [main({ utility: 'water', surveyed })] }),
    });
    expect(structured.utilities[0]).toMatchObject({
      placement: 'surveyed',
      diameterIn: 16,
      permitsOnBlock: null,
      depth: { measuredFt: 6.5, basis: 'Measured in city records' },
    });
    expect(structured.utilities[0]!.placedBy).toBe("DC Water's map of its mains");
    expect(text).toContain(
      'Water, 16 in: about 33 ft from the lot line as drawn, about 6 ft 6 in down, measured',
    );
    expect(structured.lot).toBe('Square 406, lot 809');
  });

  it("names Los Angeles's nearest house connection and its storm drain apart from the sewer", () => {
    const mapped = (source: SurveyedMain['source'], use: string): SurveyedMain => ({
      id: source,
      utility: 'sewer',
      depthFt: null,
      use,
      address: null,
      source,
      diameterIn: use === 'storm' ? 36 : null,
      material: null,
      installedYear: null,
      line: { type: 'MultiLineString', coordinates: [] },
    });
    const laAddress = { ...nycAddress, label: '200 N SPRING ST, Los Angeles, CA', bbl: undefined };
    const { structured } = whatsUnderAnswer({
      ...input,
      address: laAddress,
      region: LA,
      report: report({
        bbl: null,
        mains: [main({ utility: 'sewer', surveyed: mapped('laStormDrains', 'storm') })],
        nearbySideSewer: { main: mapped('laSideSewers', 'side'), distanceM: 7 },
      }),
    });
    expect(structured.houseSewer.status).toBe('Mapped nearby');
    expect(structured.houseSewer.detail).toContain('about 25 ft from this address');
    expect(structured.utilities[0]).toMatchObject({
      label: 'Storm drain',
      placedBy: "LA Sanitation's map of its storm drains",
    });
    // No depth of its own: the sewer range is borrowed, and the answer says it's an estimate.
    expect(structured.utilities[0]!.depth.basis).toBe("Estimated from the city's sewer depths");
    expect(structured.utilities[0]!.depth.measuredFt).toBeNull();
    const none = whatsUnderAnswer({ ...input, address: laAddress, region: LA, report: report() });
    expect(none.structured.houseSewer.status).toBe('None mapped nearby');
  });

  it('lists digging permitted today and scrubs contact details from crew text', () => {
    const today = permit();
    const { structured, text } = whatsUnderAnswer({
      ...input,
      address: nycAddress,
      region: NYC,
      report: report({ live: [today], recent: [today] }),
    });
    expect(structured.permittedToday[0]).toMatchObject({
      permittee: 'Consolidated Edison Co. Of New York, Inc.',
      street: '37 STREET between 28 AVENUE and ASTORIA BOULEVARD',
      workEnd: '2026-12-01',
    });
    expect(structured.recentPermits[0]!.work).toBe('GAS SERVICE call [phone removed]');
    expect(text).not.toContain('555-0100');
  });

  it('gives each recent permit its street, its distance and an honest date', () => {
    const frame = createFrame(nycAddress.lngLat);
    const block = (eastM: number): Geometry => ({
      type: 'LineString',
      coordinates: [frame.toLngLat([eastM, -40]), frame.toLngLat([eastM, 40])],
    });
    const done = permit({ permitNumber: 'DONE', issued: '2026-10-01', workStart: '2026-10-05' });
    const ahead = permit({
      permitNumber: 'AHEAD',
      issued: '2026-11-02',
      workStart: '2026-11-20',
      workEnd: '2026-11-25',
    });
    // Los Angeles and Denver publish only the work window.
    const unissued = permit({
      permitNumber: 'LA1',
      issued: undefined,
      workStart: '2026-11-16',
      workEnd: '2026-11-20',
      street: 'MAIN ST',
    });
    const started = permit({
      permitNumber: 'LA2',
      issued: undefined,
      workStart: '2026-09-01',
      purpose: 'GAS MAIN REPAIR',
    });
    const { structured, text } = whatsUnderAnswer({
      ...input,
      address: nycAddress,
      region: NYC,
      groups: [
        permitGroupFeature('gas|near', block(12), [done, ahead, unissued]),
        permitGroupFeature('gas|far', block(60), [started, done]),
      ],
      report: report({ recent: [unissued, ahead, done, started] }),
    });
    expect(whatsUnderOutput.parse(structured)).toEqual(structured);
    expect(structured.recentPermits).toMatchObject([
      { issued: null, workStart: '2026-11-16', scheduled: true, street: 'MAIN ST', distanceM: 12 },
      { issued: '2026-11-02', workStart: '2026-11-20', scheduled: true, distanceM: 12 },
      // Filed on both blocks, it is as near as the nearer one.
      { issued: '2026-10-01', scheduled: false, distanceM: 12 },
      { issued: null, workStart: '2026-09-01', scheduled: false, distanceM: 60 },
    ]);
    expect(text).toContain(
      'Recent excavation permits out front (date | utility | permit holder | work | street):',
    );
    expect(text).toContain(
      '- scheduled, starts 2026-11-16 | Gas | Consolidated Edison Co. Of New York, Inc. | GAS SERVICE call [phone removed] | MAIN ST, 12 m away',
    );
    expect(text).toContain('- issued 2026-11-02, scheduled, starts 2026-11-20 | Gas |');
    expect(text).toContain(
      '- issued 2026-10-01 | Gas | Consolidated Edison Co. Of New York, Inc. | GAS SERVICE call [phone removed] | 37 STREET between 28 AVENUE and ASTORIA BOULEVARD, 12 m away',
    );
    expect(text).toContain(
      '- starts 2026-09-01 | Gas | Consolidated Edison Co. Of New York, Inc. | GAS MAIN REPAIR |',
    );
    expect(text).not.toContain('issued 2026-11-16');
  });

  it('ends with the notice, the city 811 link and the spot on subsola.com', () => {
    const { structured, text } = whatsUnderAnswer({
      ...input,
      address: nycAddress,
      region: NYC,
      report: report(),
    });
    expect(structured.call811).toEqual({
      center: 'New York 811',
      url: 'https://www.newyork-811.com/',
      notice: 'two full working days',
    });
    expect(structured.mapUrl).toBe('https://subsola.com/?q=25-87%2037th%20St%2C%20Astoria');
    const lines = text.trim().split('\n');
    expect(lines.at(-4)).toContain('not a survey, and not a substitute for calling 811');
    expect(lines.at(-3)).toContain('https://www.newyork-811.com/');
    expect(lines.at(-2)).toBe(`See this spot on Subsola: ${structured.mapUrl}`);
    expect(lines.at(-1)).toBe(`Data credits: ${structured.credits}`);
    expect(structured.credits).toContain('NYC Open Data');
    expect(structured.credits).toContain('© OpenStreetMap contributors');
  });
});

describe('recentDigsAnswer', () => {
  const origin = nycAddress.lngLat;
  const frame = createFrame(origin);
  const blockAt = (eastM: number): Geometry => ({
    type: 'LineString',
    coordinates: [frame.toLngLat([eastM, -40]), frame.toLngLat([eastM, 40])],
  });
  const digs = (base: Partial<RecentDigsInput> = {}) =>
    recentDigsAnswer({
      asked: { requested: '25-87 37th St, Astoria', differs: false },
      address: nycAddress,
      region: NYC,
      builtAt: '2026-11-08T21:27:04.374Z',
      incomplete: false,
      radiusM: 150,
      sinceYear: null,
      utility: null,
      permittedToday: false,
      today: '2026-11-08',
      limit: 25,
      groups: [] as Feature<Geometry, PermitGroupProperties>[],
      ...base,
    });

  it('lists digs in the radius newest first, leaving out permits that do not open the street', () => {
    const { structured } = digs({
      groups: [
        permitGroupFeature('gas|near', blockAt(10), [
          permit({
            permitNumber: 'A',
            issued: '2020-01-01',
            workStart: '2020-01-01',
            workEnd: '2020-02-01',
          }),
          permit({ permitNumber: 'B', issued: '2026-10-01' }),
          permit({ permitNumber: 'C', issued: '2026-11-01', noOpening: true }),
        ]),
        permitGroupFeature('water|far', blockAt(400), [
          permit({ permitNumber: 'D', utility: 'water' }),
        ]),
      ],
    });
    expect(recentDigsOutput.parse(structured)).toEqual(structured);
    expect(structured.digs.map((dig) => dig.permitNumber)).toEqual(['B', 'A']);
    expect(structured.digs[0]).toMatchObject({ permittedToday: true, distanceM: 10 });
    expect(structured.digs[1]!.permittedToday).toBe(false);
    expect(structured.found).toBe(2);
  });

  it('calls out one job permitted again and again, counting permits from before since_year', () => {
    const renewals = ['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01'].map((start, index) =>
      permit({
        permitNumber: `R${index + 1}`,
        utility: 'steam',
        issued: start,
        workStart: start,
        workEnd: `${start.slice(0, 8)}28`,
        purpose: 'Repair Steam - 201804340',
      }),
    );
    const { structured, text } = digs({
      sinceYear: 2026,
      groups: [permitGroupFeature('steam|near', blockAt(10), renewals)],
    });
    expect(recentDigsOutput.parse(structured)).toEqual(structured);
    expect(structured.digs.map((dig) => dig.permitNumber)).toEqual(['R4', 'R3']);
    expect(structured.digs[0]!.job).toEqual({
      workOrder: '201804340',
      permits: 4,
      nth: 4,
      since: '2025-11-01',
      through: '2026-02-28',
      renewals: null,
    });
    expect(text).toContain(
      'Repair Steam - 201804340 (Same job permitted 4 times, Nov 2025 to Feb 2026, work order 201804340)',
    );
  });

  it('scrubs names from the purpose and the hand-typed street, and says when the match differs', () => {
    const { structured, text } = digs({
      asked: { requested: '25-87 37th St', differs: true },
      groups: [
        permitGroupFeature('gas|near', blockAt(10), [
          permit({
            permitNumber: 'S',
            purpose: 'Installing Corrosion Test Station Hallen/R. Paquette/055 - MR',
            street: '800 BLOCK OF F ST NW PER J. Strohminger',
          }),
        ]),
      ],
    });
    expect(structured.digs[0]!.work).toBe(
      'Installing Corrosion Test Station Hallen/[name removed]/055 - MR',
    );
    expect(structured.digs[0]!.street).toBe('800 BLOCK OF F ST NW PER [name removed]');
    expect(text.split('\n')[0]).toBe(
      'Matched to 25-87 37th St, Astoria (you asked for 25-87 37th St).',
    );
    expect(structured).toMatchObject({
      requestedAddress: '25-87 37th St',
      matchedAddress: '25-87 37th St, Astoria',
      matchDiffers: true,
    });
  });

  it('keeps to the year asked for and caps the list, counting all it found', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      permit({ permitNumber: `P${i}`, issued: `20${String(i).padStart(2, '0')}-05-01` }),
    );
    const { structured, text } = digs({
      groups: [permitGroupFeature('gas|near', blockAt(10), many)],
      sinceYear: 2010,
      limit: 5,
    });
    expect(structured.found).toBe(20);
    expect(structured.digs.map((dig) => dig.issued)).toEqual([
      '2029-05-01',
      '2028-05-01',
      '2027-05-01',
      '2026-05-01',
      '2025-05-01',
    ]);
    expect(structured).toMatchObject({ total: 20, shown: 5 });
    expect(text).toContain('20 utility digs on record within 150 m');
    expect(text).toContain('since 2010; the newest 5 are listed');
    expect(text).toContain(
      '15 more not listed. Narrow with since_year, radius_m, utility or permitted_today.',
    );
    expect(structured.mapUrl).toBe(`${mapUrl('25-87 37th St, Astoria', 2010)}`);
    expect(structured.mapUrl).toContain('since=2010');
  });

  it('filters by utility and by digging permitted today', () => {
    const groups = [
      permitGroupFeature('mixed', blockAt(10), [
        permit({ permitNumber: 'G-OPEN', utility: 'gas', issued: '2026-10-01' }),
        permit({
          permitNumber: 'G-DONE',
          utility: 'gas',
          issued: '2020-01-01',
          workStart: '2020-01-01',
          workEnd: '2020-02-01',
        }),
        permit({ permitNumber: 'W-OPEN', utility: 'water', issued: '2026-10-02' }),
      ]),
    ];
    const gas = digs({ groups, utility: 'gas' });
    expect(gas.structured.digs.map((dig) => dig.permitNumber)).toEqual(['G-OPEN', 'G-DONE']);
    expect(gas.text).toContain('2 gas digs on record');
    expect(gas.text).not.toContain('more not listed');
    const open = digs({ groups, permittedToday: true });
    expect(open.structured.digs.map((dig) => dig.permitNumber)).toEqual(['W-OPEN', 'G-OPEN']);
    expect(open.structured).toMatchObject({ permittedToday: true, total: 2, shown: 2 });
    expect(open.text).toContain(', permitted today.');
    expect(recentDigsOutput.parse(open.structured)).toEqual(open.structured);
  });

  it('dates a permit with no issue date by its work start, for order, since_year and text', () => {
    const { structured, text } = digs({
      sinceYear: 2026,
      groups: [
        permitGroupFeature('water|near', blockAt(10), [
          permit({ permitNumber: 'OLD', issued: undefined, workStart: '2025-12-01' }),
          permit({
            permitNumber: 'SOON',
            issued: undefined,
            workStart: '2026-11-16',
            workEnd: '2026-11-20',
          }),
          permit({ permitNumber: 'ISSUED', issued: '2026-10-01', workStart: '2026-10-02' }),
          permit({ permitNumber: 'NOW', issued: undefined, workStart: '2026-11-01' }),
        ]),
      ],
    });
    expect(recentDigsOutput.parse(structured)).toEqual(structured);
    expect(structured.digs.map((dig) => dig.permitNumber)).toEqual(['SOON', 'NOW', 'ISSUED']);
    expect(structured.digs.map((dig) => dig.scheduled)).toEqual([true, false, false]);
    expect(text).toContain('Date | utility | permit holder | work | street | work window | permit');
    expect(text).toContain('- scheduled, starts 2026-11-16 | Gas |');
    expect(text).toContain('- starts 2026-11-01 | Gas |');
    expect(text).toContain('- issued 2026-10-01 | Gas |');
  });

  it('counts a permit filed on two blocks once, at the nearer one', () => {
    const { structured } = digs({
      groups: [
        permitGroupFeature('gas|a', blockAt(60), [permit({ permitNumber: 'X' })]),
        permitGroupFeature('gas|b', blockAt(20), [permit({ permitNumber: 'X' })]),
      ],
    });
    expect(structured.digs).toHaveLength(1);
    expect(structured.digs[0]!.distanceM).toBe(20);
  });

  it('says so when there are none, still ending with 811', () => {
    const { text } = digs();
    expect(text).toContain('No utility digs on record within 150 m');
    expect(text).toContain('https://www.newyork-811.com/');
  });
});
