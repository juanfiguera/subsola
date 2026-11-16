import { describe, expect, it } from 'vitest';
import { formatApn, sdServiceLine, sdServiceSide } from './services';

const RECORD = 'Installation record (e.g., tap card)';
const NOT_REQUIRED = 'Field Verification Not Required - See Customer Source';

describe('sdServiceSide', () => {
  it('names the pipe from the material', () => {
    expect(sdServiceSide('Non-Lead - Copper', 2, RECORD, null)).toEqual({
      material: 'non-lead',
      verified: true,
      pipe: 'Copper',
    });
    expect(sdServiceSide('Non-Lead - Other', 2, RECORD, null).pipe).toBe('Non-Lead');
    expect(sdServiceSide('Lead-lined galvanized', 1, RECORD, null).material).toBe('lead');
  });

  it('lets the material win over a status code that disagrees', () => {
    expect(sdServiceSide('Non-Lead - Other', 1, 'Predictive model', NOT_REQUIRED).material).toBe(
      'non-lead',
    );
  });

  it('falls back to the status code when no material is named', () => {
    expect(sdServiceSide(null, 2, null, null)).toEqual({
      material: 'non-lead',
      verified: false,
      pipe: 'Non-Lead',
    });
    expect(sdServiceSide(null, 0, null, null).material).toBe('unknown');
    expect(sdServiceSide(null, null, null, null).material).toBe('unknown');
  });

  it('counts galvanized as needing replacement only when the city says so', () => {
    expect(
      sdServiceSide('Galvanized', 3, 'Predictive model', 'Visual inspection at meter pit'),
    ).toEqual({ material: 'galvanized', verified: true, pipe: 'Galvanized' });
    expect(sdServiceSide('Galvanized', 2, RECORD, null)).toEqual({
      material: 'non-lead',
      verified: true,
      pipe: 'Galvanized',
    });
  });

  it('keeps unlikely lead as unknown', () => {
    expect(sdServiceSide('Unknown - Unlikely Lead', 0, 'Predictive model', null)).toEqual({
      material: 'unknown',
      verified: false,
      pipe: 'Not recorded',
    });
  });

  it("calls a predictive model's answer suspected, even where the city marks it verified", () => {
    expect(sdServiceSide('Non-Lead - Copper', 2, 'Predictive model', NOT_REQUIRED).verified).toBe(
      false,
    );
    expect(
      sdServiceSide('Non-Lead - Copper', 2, 'Predictive model', 'Visual inspection at meter pit')
        .verified,
    ).toBe(true);
  });
});

describe('sdServiceLine', () => {
  const row = {
    OBJECTID: 1,
    address: '4515 Felton St',
    APN: null,
    geometry: { x: -117.1, y: 32.7 },
    utilmaterial: 'Non-Lead - Other',
    utilstatus: 2,
    utilsource: RECORD,
    utilverifmethod: null,
    custmaterial: null,
    custstatus: 0,
    custsource: null,
    custverifmethod: null,
    bothsidesstatus: 'Non-Lead',
  };

  it("takes the city's call on the whole line, even with the owner's side unknown", () => {
    expect(sdServiceLine(row)).toMatchObject({
      material: 'non-lead',
      basis: 'Suspected',
      privateSide: { material: 'unknown' },
    });
  });

  it('falls back to the worse side, and is verified only when both sides are', () => {
    expect(sdServiceLine({ ...row, bothsidesstatus: null })).toMatchObject({
      material: 'unknown',
      basis: 'No information',
    });
    expect(
      sdServiceLine({
        ...row,
        custmaterial: 'Non-Lead - Copper',
        custstatus: 2,
        custsource: RECORD,
      }).basis,
    ).toBe('Verified');
  });
});

describe('formatApn', () => {
  it('writes a parcel number the way the county does', () => {
    expect(formatApn('5382301200')).toBe('538-230-12-00');
    expect(formatApn('123')).toBe('123');
  });
});
