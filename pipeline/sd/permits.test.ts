import { describe, expect, it } from 'vitest';
import { classifySdPermit } from './permits';
import { sdPermitDates, sdPermitStreet } from './build';
import { csvRowMatches } from '../csv';
import { SD_DATASETS, sdPermitSchema } from './datasets';

describe('classifySdPermit', () => {
  it('reads the company from the holder or the scope, never keeping a person', () => {
    expect(
      classifySdPermit('SDGE, Betty Blanford', null, 'Trench 30 LF to repair gas main', null),
    ).toEqual([{ utility: 'gas', owner: 'SDG&E', assumed: false }]);
    expect(
      classifySdPermit('Kaitlyn Peterson', null, 'Verizon 1Fiber: trench to install conduit', null),
    ).toMatchObject([{ utility: 'telecom', owner: 'Verizon' }]);
    expect(
      classifySdPermit('Pacific Bell -AT&T, Joe Strafaci', 'ATT Trenching', null, null)[0]?.owner,
    ).toBe('AT&T');
    expect(
      classifySdPermit('Daniel Velasco', null, 'COX - PUBLIC RIGHT OF WAY PERMIT', null)[0]?.owner,
    ).toBe('Cox');
  });

  it("files SDG&E as electric when it doesn't say, and marks it assumed", () => {
    expect(
      classifySdPermit('SDG&E', null, "SDGE - 300000796946 to remove 35' wood pole", null),
    ).toEqual([{ utility: 'electric', owner: 'SDG&E', assumed: false }]);
    expect(
      classifySdPermit('SDG&E', null, 'SDGE - 300000612569 work in the right of way', null),
    ).toEqual([{ utility: 'electric', owner: 'SDG&E', assumed: true }]);
  });

  it('files both when SDG&E or its contractor names gas and electric work', () => {
    expect(
      classifySdPermit('SDG&E', null, 'SDGE - trench for new gas and electric services', null).map(
        (work) => work.utility,
      ),
    ).toEqual(['gas', 'electric']);
    expect(classifySdPermit('Hot Line Electric', null, 'Install conduit for SDG&E', null)).toEqual([
      { utility: 'electric', owner: 'SDG&E', assumed: false },
    ]);
  });

  it('counts the undergrounding program as electric, whoever filed it', () => {
    expect(
      classifySdPermit(
        'SOUTHERN CONTRACTING CO.',
        'electrical permit',
        'oh to ug conv. prog.',
        'Elec. Utility Undergrnd. Prgm',
      ),
    ).toMatchObject([{ utility: 'electric', owner: 'SDG&E' }]);
  });

  it('finds private water and sewer connections, and skips street work', () => {
    expect(
      classifySdPermit(null, "Faulds' Trench", 'Trench for combination Fire/Water service', null)[0]
        ?.utility,
    ).toBe('water');
    expect(
      classifySdPermit('Someone', null, 'Re route existing sewer line to the alley', null)[0]
        ?.utility,
    ).toBe('sewer');
    expect(classifySdPermit('Someone', null, 'Remove and replace existing driveway', null)).toEqual(
      [],
    );
    expect(
      classifySdPermit('Someone', null, 'Minor right of way permit for 9 potholes', null),
    ).toEqual([]);
  });
});

describe('sdPermitStreet', () => {
  it('drops the house number, the in-street fraction and the city', () => {
    expect(sdPermitStreet('6832 1/3 Newbold Ct, San Diego, CA')).toBe('Newbold Ct');
    expect(sdPermitStreet('9555 1/3 DISTRIBUTION AV ')).toBe('DISTRIBUTION AV');
    expect(sdPermitStreet('2320 05th Av, San Diego, CA')).toBe('5th Av');
  });
});

describe('sdPermitDates', () => {
  it('takes the issue date, and work from it to the close or the expiry', () => {
    expect(
      sdPermitDates({
        APPROVAL_ISSUE_DATE: Date.UTC(2025, 5, 3),
        APPROVAL_CLOSE_DATE: Date.UTC(2025, 8, 1),
        APPROVAL_EXPIRE_DATE: Date.UTC(2026, 5, 3),
      }),
    ).toEqual({ issued: '2025-06-03', workStart: '2025-06-03', workEnd: '2025-09-01' });
    expect(
      sdPermitDates({
        APPROVAL_ISSUE_DATE: Date.UTC(2025, 5, 3),
        APPROVAL_EXPIRE_DATE: Date.UTC(2026, 5, 3),
      }),
    ).toEqual({ issued: '2025-06-03', workStart: '2025-06-03', workEnd: '2026-06-03' });
  });

  it('leaves out an approval that was never issued', () => {
    expect(sdPermitDates({ APPROVAL_ISSUE_DATE: null, APPROVAL_EXPIRE_DATE: null })).toBeNull();
  });
});

describe('the portal CSV', () => {
  const matchOf = (name: string) => SD_DATASETS.find((spec) => spec.name === name)!.csv!.match;

  it('reads dates as midnight UTC and the point in degrees, as the map server gave them', () => {
    const row = sdPermitSchema.parse({
      APPROVAL_ID: 'PMT-3313094',
      APPROVAL_ISSUE_DATE: '2024-10-25',
      APPROVAL_EXPIRE_DATE: '2025-10-25',
      GIS_LATITUDE: '32.720663',
      GIS_LONGITUDE: '-117.124564',
    });
    expect(row).toMatchObject({
      APPROVAL_ISSUE_DATE: Date.UTC(2024, 9, 25),
      APPROVAL_EXPIRE_DATE: Date.UTC(2025, 9, 25),
      APPROVAL_CLOSE_DATE: null,
      GIS_LATITUDE: 32.720663,
      GIS_LONGITUDE: -117.124564,
    });
    expect(sdPermitDates(row)).toEqual({
      issued: '2024-10-25',
      workStart: '2024-10-25',
      workEnd: '2025-10-25',
    });
  });

  it('takes a zero or unreadable point as none', () => {
    expect(
      sdPermitSchema.parse({ APPROVAL_ID: '1', GIS_LATITUDE: '0', GIS_LONGITUDE: 'n/a' }),
    ).toMatchObject({ GIS_LATITUDE: null, GIS_LONGITUDE: null });
  });

  it('keeps construction permits in the street and leaves out traffic control', () => {
    const now = matchOf('sdPermits');
    expect(
      csvRowMatches(
        {
          PROJECT_TYPE: 'Right of Way - Dry Utilities',
          APPROVAL_TYPE: 'Approval - Construction - Right Of Way Pmt-Const Plan',
        },
        now,
      ),
    ).toBe(true);
    expect(
      csvRowMatches(
        {
          PROJECT_TYPE: 'Right of Way - Dry Utilities',
          APPROVAL_TYPE: 'Approval - Construction - Traffic Control Permit',
        },
        now,
      ),
    ).toBe(false);
    expect(
      csvRowMatches(
        {
          PROJECT_TYPE: 'Building Construction',
          APPROVAL_TYPE: 'Approval - Construction - Right Of Way Pmt',
        },
        now,
      ),
    ).toBe(false);
    const before = matchOf('sdPermitsOld');
    expect(csvRowMatches({ APPROVAL_TYPE: 'Elec. Utility Undergrnd. Prgm' }, before)).toBe(true);
    expect(csvRowMatches({ APPROVAL_TYPE: 'Right Of Way Permit' }, before)).toBe(true);
    expect(csvRowMatches({ APPROVAL_TYPE: 'Right Of Way Permit-Traffic Control' }, before)).toBe(
      false,
    );
  });
});
