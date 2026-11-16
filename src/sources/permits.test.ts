import { describe, expect, it } from 'vitest';
import {
  classifyPermit,
  groupPermits,
  permitGroupFeature,
  scrubContacts,
  type PermitRecord,
  type PermitRow,
} from './permits';
import { permitDateText } from './permitDay';
import { blockLocator, streetMatchKey, toPermitStreetName, type StreetSegment } from './streets';
import { distanceMeters } from '../geo';
import { parseStateplaneWkt } from '../stateplane';
import { activeWork } from '../work';

describe('classifyPermit', () => {
  it.each([
    ['MAJOR INSTALLATION - GAS', 'CONSOLIDATED EDISON', 'gas'],
    ['MAJ INSTALL GAS STORAGE OF MATERIAL-PROT', 'CONSOLIDATED EDISON', 'gas'],
    ['MAJOR INSTALLATIONS - HIGH VOLTAGE', 'CONSOLIDATED EDISON', 'electric'],
    ['REPAIR ELECTRIC/COMMUNICATIONS', 'CONSOLIDATED EDISON', 'electric'],
    ['REPAIR ELECTRIC/COMMUNICATIONS - PROT', 'TIME WARNER ENTERTAINMENT CO L', 'telecom'],
    ['CONDUIT CONSTRUCTION AND FRANCHISE', 'CABLEVISION SYSTEMS NEW YORK', 'telecom'],
    ['CONDUIT CONSTRUCTION AND FRANCHISE', 'CONSOLIDATED EDISON', 'electric'],
    ['CONSTRUCT OR ALTER MANHOLE &/OR CASTING', 'KEYSPAN ENERGY DELIVERY N.Y.C.', 'gas'],
    [
      'CONSTRUCT OR ALTER MANHOLE &/OR CASTING',
      'THE BROOKLYN UNION GAS COMPANY D/B/A NATIONAL GRID NY',
      'gas',
    ],
    ['REPAIR WATER - SEWER - PROTECTED', 'JOSEPH L. BALKAN, INC.', 'sewer'],
    ['REPAIR WATER', 'JOSEPH L. BALKAN, INC.', 'water'],
    ['D.D.C. CONTRACTOR MAJOR RECONSTRUCTION', 'TULLY CONSTRUCTION CO. INC.', 'capital'],
    ['COMMERCIAL REFUSE CONTAINER', 'AVID WASTE SYSTEMS, INC.', null],
    ['REPLACE SIDEWALK', 'HOMEOWNER', null],
  ])('%s by %s -> %s', (type, permittee, expected) => {
    expect(classifyPermit(type, permittee)).toBe(expected);
  });
});

describe('toPermitStreetName', () => {
  it('expands CSCL suffixes to the DOT permit spelling', () => {
    expect(toPermitStreetName('37 ST')).toBe('37 STREET');
    expect(toPermitStreetName('28 AVE')).toBe('28 AVENUE');
    expect(toPermitStreetName('ASTORIA BLVD')).toBe('ASTORIA BOULEVARD');
    expect(toPermitStreetName('STEINWAY ST')).toBe('STEINWAY STREET');
  });
});

describe('parseStateplaneWkt', () => {
  it('converts NY State Plane feet to WGS84 near the expected spot', () => {
    // Real permit geometry at 37 St & Astoria Blvd, Queens.
    const geometry = parseStateplaneWkt(
      'MULTIPOINT ((1008505.4854000062 219725.86939999461), (1008371.4536000043 219514.96430000663))',
    );
    expect(geometry?.type).toBe('MultiPoint');
    expect(distanceMeters([-73.91477, 40.766532], geometry!)).toBeLessThan(400);
  });

  it('parses multilinestrings and rejects garbage', () => {
    const geometry = parseStateplaneWkt('MULTILINESTRING ((1 2, 3 4), (5 6, 7 8))');
    expect(geometry?.type).toBe('MultiLineString');
    expect(parseStateplaneWkt('NOT WKT')).toBeNull();
    expect(parseStateplaneWkt(undefined)).toBeNull();
  });
});

describe('blockLocator', () => {
  const segment = (permitName: string, coordinates: [number, number][]): StreetSegment => ({
    label: permitName,
    permitName,
    borough: 'MANHATTAN',
    geometry: { type: 'MultiLineString', coordinates: [coordinates] },
  });
  // A grid corner: Mott runs north-south, Grand and Hester cross it.
  const streets = [
    segment('MOTT STREET', [
      [-73.9966, 40.7185],
      [-73.9962, 40.7195],
    ]),
    segment('MOTT STREET', [
      [-73.9962, 40.7195],
      [-73.9958, 40.7205],
    ]),
    segment('GRAND STREET', [
      [-73.998, 40.719],
      [-73.9966, 40.7185],
    ]),
    segment('HESTER STREET', [
      [-73.9975, 40.72],
      [-73.9962, 40.7195],
    ]),
  ];
  const locate = blockLocator(streets);

  it('draws the block between the two cross streets', () => {
    expect(
      locate('MANHATTAN', 'MOTT STREET', 'GRAND STREET', 'HESTER STREET')?.coordinates,
    ).toEqual([
      [-73.9966, 40.7185],
      [-73.9962, 40.7195],
    ]);
  });

  it('copes with the extra spaces DOT puts in names', () => {
    expect(locate('MANHATTAN', '  MOTT  STREET', 'GRAND STREET', 'HESTER   STREET')).not.toBeNull();
  });

  it('keeps boroughs apart, since the same names meet in more than one', () => {
    expect(locate('BROOKLYN', 'MOTT STREET', 'GRAND STREET', 'HESTER STREET')).toBeNull();
  });

  it('falls back to a point at the one corner it can find', () => {
    const corner = { type: 'Point', coordinates: [-73.9966, 40.7185] };
    expect(locate('MANHATTAN', 'MOTT STREET', 'GRAND STREET', 'CANAL STREET')).toEqual(corner);
    expect(locate('MANHATTAN', 'MOTT STREET', 'GRAND STREET', undefined)).toEqual(corner);
    expect(locate('MANHATTAN', 'MOTT STREET', 'DEAD END', 'GRAND STREET')).toEqual(corner);
  });

  it('gives up when neither cross street meets the street', () => {
    expect(locate('MANHATTAN', 'MOTT STREET', 'CANAL STREET', 'BEND')).toBeNull();
    expect(locate('MANHATTAN', 'ELIZABETH STREET', 'GRAND STREET', 'HESTER STREET')).toBeNull();
  });

  it('matches the centerline and permit spellings of the same street', () => {
    const named = blockLocator([
      { ...segment('DEKALB AVE', streets[0]!.geometry.coordinates[0]!) },
      { ...segment('FORT HAMILTON PKWY', streets[2]!.geometry.coordinates[0]!) },
      { ...segment('AVE OF THE AMERICAS', streets[3]!.geometry.coordinates[0]!) },
    ]);
    expect(named('MANHATTAN', 'DE KALB AVENUE', 'FT HAMILTON PARKWAY', '6 AVENUE')?.type).toBe(
      'LineString',
    );
  });
});

describe('streetMatchKey', () => {
  it('spells both sides the same way', () => {
    const same = (a: string, b: string) => expect(streetMatchKey(a)).toBe(streetMatchKey(b));
    same('CENTRAL PARK W', 'CENTRAL PARK WEST');
    same('W BROADWAY', 'WEST BROADWAY');
    same('AVE C', 'AVENUE C');
    same('7 AVE S', '7 AVENUE SOUTH');
    same('UNION TPKE', 'UNION TURNPIKE');
    same('GRAND CONC', 'GRAND CONCOURSE');
    same('F D R DRIVE', 'FDR DR');
    same('E 20 ST', 'EAST   20 STREET');
    same('ST JOHNS PL', 'SAINT JOHNS PLACE');
  });

  it('keeps different streets apart', () => {
    expect(streetMatchKey('AVENUE C')).not.toBe(streetMatchKey('AVENUE D'));
    expect(streetMatchKey('WEST 20 STREET')).not.toBe(streetMatchKey('EAST 20 STREET'));
  });
});

describe('groupPermits', () => {
  const row = (overrides: Partial<PermitRow>): PermitRow => ({
    permitnumber: 'P1',
    boroughname: 'MANHATTAN',
    permittypedesc: 'REPAIR WATER',
    permitteename: 'DEP',
    onstreetname: 'MOTT STREET',
    fromstreetname: 'GRAND STREET',
    tostreetname: 'HESTER STREET',
    ...overrides,
  });
  const block = {
    type: 'LineString' as const,
    coordinates: [
      [-73.9966, 40.7185],
      [-73.9962, 40.7195],
    ],
  };
  const locate = () => block;

  it("doesn't count manhole embargo permits as digs, but keeps a block that has nothing else", () => {
    const embargo = (permitnumber: string, onstreetname = 'MOTT STREET') =>
      row({
        permitnumber,
        onstreetname,
        permittypedesc: 'UTILITY MANHOLE EMBARGO PERMIT',
        permitteename: 'CONSOLIDATED EDISON',
        issuedworkstartdate: '2026-01-01T00:00:00',
        issuedworkenddate: '2099-01-01T00:00:00',
      });
    const [mixed, accessOnly] = groupPermits(
      [
        { row: embargo('E1'), dataset: 'permitsCurrent' },
        {
          row: row({
            permitnumber: 'D1',
            permittypedesc: 'REPAIR ELECTRIC/COMMUNICATIONS',
            permitteename: 'CONSOLIDATED EDISON',
          }),
          dataset: 'permitsCurrent',
        },
        { row: embargo('E2', 'ELIZABETH STREET'), dataset: 'permitsCurrent' },
      ],
      locate,
    );
    expect(mixed!.properties.permits.map((p) => p.permitNumber)).toEqual(['D1']);
    expect(mixed!.properties.count).toBe(1);
    expect(accessOnly!.properties.count).toBe(0);
    expect(accessOnly!.properties.permits.map((p) => p.permitNumber)).toEqual(['E2']);
    expect(activeWork([accessOnly!], '2026-06-01')).toEqual([]);
  });

  it("keeps the city's renewal and extension marks, and nothing for a new permit", () => {
    const [group] = groupPermits(
      [
        {
          row: row({ permitnumber: 'N', applicationtypeshortdesc: 'New' }),
          dataset: 'permitsHistoric',
        },
        {
          row: row({ permitnumber: 'R', applicationtypeshortdesc: 'Renew' }),
          dataset: 'permitsHistoric',
        },
        {
          row: row({ permitnumber: 'X', applicationtypeshortdesc: 'Extend' }),
          dataset: 'permitsCurrent',
        },
      ],
      locate,
    );
    const marks = Object.fromEntries(
      group!.properties.permits.map((p) => [p.permitNumber, p.renews]),
    );
    expect(marks).toEqual({ N: undefined, R: 'renewal', X: 'extension' });
    expect(group!.properties.permits.find((p) => p.permitNumber === 'N')).not.toHaveProperty(
      'renews',
    );
  });

  it('groups a block filed either way round once, keyed by borough', () => {
    const groups = groupPermits(
      [
        { row: row({}), dataset: 'permitsCurrent' },
        {
          row: row({
            permitnumber: 'P2',
            fromstreetname: 'HESTER STREET',
            tostreetname: 'GRAND STREET',
          }),
          dataset: 'permitsHistoric',
        },
      ],
      locate,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.properties.key).toBe(
      'water|MANHATTAN|MOTT STREET|GRAND STREET|HESTER STREET',
    );
    expect(groups[0]?.properties.permits.map((p) => p.dataset)).toEqual([
      'permitsCurrent',
      'permitsHistoric',
    ]);
  });

  it('keeps the same names in another borough apart', () => {
    const groups = groupPermits(
      [
        { row: row({}), dataset: 'permitsCurrent' },
        { row: row({ boroughname: 'BROOKLYN' }), dataset: 'permitsCurrent' },
      ],
      locate,
    );
    expect(groups).toHaveLength(2);
  });

  it('groups permits naming one cross street by that corner, not all together', () => {
    const groups = groupPermits(
      [
        { row: row({ tostreetname: undefined }), dataset: 'permitsCurrent' },
        {
          row: row({ permitnumber: 'P2', fromstreetname: 'CANAL STREET', tostreetname: undefined }),
          dataset: 'permitsCurrent',
        },
      ],
      locate,
    );
    expect(groups.map((group) => group.properties.key)).toEqual([
      'water|MANHATTAN|MOTT STREET||GRAND STREET',
      'water|MANHATTAN|MOTT STREET||CANAL STREET',
    ]);
  });

  it('drops non-utility work, unplaceable blocks and blocks outside the area', () => {
    expect(
      groupPermits(
        [{ row: row({ permittypedesc: 'REPLACE SIDEWALK' }), dataset: 'permitsCurrent' }],
        locate,
      ),
    ).toEqual([]);
    expect(groupPermits([{ row: row({}), dataset: 'permitsCurrent' }], () => null)).toEqual([]);
    expect(
      groupPermits([{ row: row({}), dataset: 'permitsCurrent' }], locate, () => false),
    ).toEqual([]);
  });
});

describe('scrubContacts', () => {
  it('takes out phone numbers and emails, and leaves crew measurements alone', () => {
    expect(scrubContacts('Call John 212-555-0100 or j.doe@example.com')).toBe(
      'Call John [phone removed] or [email removed]',
    );
    expect(scrubContacts('(415) 555 0100 before 7am')).toBe('[phone removed] before 7am');
    expect(scrubContacts("0' NSC OF 28TH AVE & 4' WEC OF 37TH ST")).toBe(
      "0' NSC OF 28TH AVE & 4' WEC OF 37TH ST",
    );
    expect(scrubContacts('Permit 13EXC-4281, 1200 ft of 8 in main')).toBe(
      'Permit 13EXC-4281, 1200 ft of 8 in main',
    );
  });

  it('catches numbers the way DC and NYC crews actually type them', () => {
    for (const typed of [
      'CALL MR. SMITH AT202-379-8791 BEFORE',
      'ROBERT BROWN/202/388-2602/ (RACM)',
      'STEPHEN PARK (202) 3882573',
      'Umair Zia (202) 388- 2235 )',
      'CALL 202- 437 -3735 OR',
      'designer 202-3882522 supervisor',
      'per Josh with Flippo Construction 3019676800 at',
      'CARR #646-689-6785',
      'SERVICE RD OF LIE.718-271-3189-QG12002210',
      'Resident Engineer (858)-717-4713',
    ]) {
      expect(scrubContacts(typed), typed).toContain('[phone removed]');
    }
    expect(scrubContacts('(NCarino @pepco.com) Smith')).toBe('([email removed]) [name removed]');
  });

  it('leaves permit, pole, parcel and work order numbers and gas pressures alone', () => {
    for (const text of [
      'ENT, REPLACE 1 SERVICE, p 977421 w 3858590 bca 304054',
      'GAS MAIN G23-0100614835',
      'existing pole P2138169772',
      'PEPCO POLE 782401-3002 SO THAT',
      '816/840/936/1018 CHENERY ST',
      'ID: 482680- 2358 GLEBE AVE',
      'APN 424-171-1400',
      'Contract ID NO. 1000012522',
      'INSTALL 3/4" PLA @ 7.0 W.C.',
    ]) {
      expect(scrubContacts(text), text).toBe(text);
    }
  });
});

describe('permits with no issue date', () => {
  const record = (permitNumber: string, issued: string | undefined, workStart: string) =>
    ({
      permitNumber,
      utility: 'water',
      type: 'Excavation (U) permit',
      permittee: 'LADWP',
      issued,
      workStart,
      workEnd: undefined,
      status: undefined,
      street: 'MAIN ST',
      purpose: undefined,
      locationNote: undefined,
      mentionsMain: false,
      dataset: 'laPermitsArchived',
    }) satisfies PermitRecord;

  it("orders and dates a block's permits by the work's start", () => {
    const group = permitGroupFeature('water|la|a', { type: 'Point', coordinates: [0, 0] }, [
      record('A', undefined, '2019-04-01'),
      record('B', undefined, '2024-06-01'),
      record('C', '2021-02-01', '2021-03-01'),
    ]);
    expect(group.properties.permits.map((permit) => permit.permitNumber)).toEqual(['B', 'C', 'A']);
    expect(group.properties).toMatchObject({ firstYear: 2019, lastYear: 2024 });
  });

  it('says "Starts" rather than passing the start off as an issue date', () => {
    expect(permitDateText(record('A', undefined, '2026-11-16'))).toBe('Starts 2026-11-16');
    expect(permitDateText(record('A', '2026-11-02', '2026-11-16'))).toBe('2026-11-02');
    expect(permitDateText({ issued: undefined, workStart: undefined })).toBe('Undated');
  });
});
