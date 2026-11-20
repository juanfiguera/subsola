import { describe, expect, it } from 'vitest';
import { dalServiceLine, dalServiceSide } from './services';

const row = (fields: Record<string, unknown>) => ({
  OBJECTID: 1,
  address: '3816 FORTUNE LN',
  utilmaterial: 'Non-Lead - Copper',
  utilstatus: 2,
  utilsource: 'Utility Standard Drawing Manual',
  utilverified: null,
  custmaterial: 'Unknown - Material Unknown',
  custstatus: 0,
  custsource: null,
  custverified: null,
  bothsidesstatus: 'Unknown',
  yearstructbuilt: 1955,
  geometry: { x: -96.8156, y: 32.698 },
  ...fields,
});

describe('dalServiceSide', () => {
  it('reads a side off the standard drawings as suspected, and off a record as verified', () => {
    expect(dalServiceSide('Non-Lead - Copper', 2, 'Utility Standard Drawing Manual', null)).toEqual(
      { material: 'non-lead', verified: false, pipe: 'Copper' },
    );
    expect(dalServiceSide('Non-Lead - Copper', 2, 'Deadhead Card', null).verified).toBe(true);
    expect(dalServiceSide('Non-Lead - Copper', 2, 'Construction Plans', null).verified).toBe(true);
    expect(dalServiceSide('Non-Lead - Other', 2, 'Other', 'Yes').verified).toBe(true);
  });

  it('never calls an unknown side verified', () => {
    expect(dalServiceSide('Unknown - Material Unknown', 0, 'Deadhead Card', 'Yes')).toEqual({
      material: 'unknown',
      verified: false,
      pipe: 'Not recorded',
    });
  });

  it('counts galvanized only where DWU says it needs replacing', () => {
    expect(dalServiceSide('Galvanized', 3, 'Other', 'Yes').material).toBe('galvanized');
    expect(dalServiceSide('Galvanized', 2, 'Other', null).material).toBe('non-lead');
  });
});

describe('dalServiceLine', () => {
  it("takes DWU's call on the whole line where it makes one", () => {
    const line = dalServiceLine(
      row({
        custmaterial: 'Galvanized',
        custstatus: 3,
        custverified: 'Yes',
        bothsidesstatus: 'Galvanized Requiring Replacement',
      }),
    );
    expect(line.material).toBe('galvanized');
    expect(line.privateSide.material).toBe('galvanized');
  });

  it('says no information while the line is unknown, and suspected until both sides are verified', () => {
    expect(dalServiceLine(row({})).basis).toBe('No information');
    expect(
      dalServiceLine(
        row({
          custmaterial: 'Non-Lead - Copper',
          custstatus: 2,
          custsource: 'Installation date is after the lead ban',
          bothsidesstatus: 'Non-Lead',
        }),
      ).basis,
    ).toBe('Suspected');
    expect(
      dalServiceLine(
        row({
          utilsource: 'Deadhead Card',
          custmaterial: 'Non-Lead - Copper',
          custstatus: 2,
          custsource: 'Installation date is after the lead ban',
          bothsidesstatus: 'Non-Lead',
        }),
      ).basis,
    ).toBe('Verified');
  });
});
