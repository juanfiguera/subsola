import { describe, expect, it } from 'vitest';
import { classifyLaPermit, emailDomain } from './permits';
import { laPermitDates, laPermitNumber, laPermitStreet } from './build';

describe('classifyLaPermit', () => {
  it('reads the utility from the email domain alone', () => {
    expect(classifyLaPermit('someone@socalgas.com')).toEqual({
      utility: 'gas',
      owner: 'SoCalGas',
      assumed: false,
    });
    expect(classifyLaPermit('someone@semprautilities.com')?.utility).toBe('gas');
    expect(classifyLaPermit('someone@att.com')?.utility).toBe('telecom');
    expect(classifyLaPermit('someone@water.ladwp.com')).toMatchObject({
      utility: 'water',
      assumed: false,
    });
  });

  it("files LADWP as water when it doesn't say, and marks it assumed", () => {
    expect(classifyLaPermit('someone@ladwp.com')).toEqual({
      utility: 'water',
      owner: 'LADWP',
      assumed: true,
    });
  });

  it('copes with a field cut short or holding several addresses', () => {
    expect(classifyLaPermit('a.very.long.name@socalgas.c')?.utility).toBe('gas');
    expect(emailDomain('one@ladwp.com, two@ladwp.com')).toBe('ladwp.com');
  });

  it('leaves out contractors and personal mail', () => {
    expect(classifyLaPermit('someone@gmail.com')).toBeNull();
    expect(classifyLaPermit('someone@inland-engineering.com')).toBeNull();
    expect(classifyLaPermit(null)).toBeNull();
  });
});

describe('laPermitStreet', () => {
  it('takes the first street of the location', () => {
    expect(laPermitStreet('19150 Harnett St. and Vanalden Ave.')).toBe('Harnett St');
    expect(laPermitStreet('3401 Riverside Dr, Los Angeles, CA  and Lose Feliz Blvd')).toBe(
      'Riverside Dr',
    );
    expect(laPermitStreet('6760 5th Ave and W 70TH ST')).toBe('5th Ave');
  });
});

describe('laPermitDates', () => {
  it('keeps the work window and no issue date, which the layers do not have', () => {
    const dates = laPermitDates({
      StartDate: Date.UTC(2026, 10, 16),
      EndDate: Date.UTC(2026, 10, 20),
    });
    expect(dates).toEqual({ workStart: '2026-11-16', workEnd: '2026-11-20' });
    expect(dates).not.toHaveProperty('issued');
  });

  it('leaves a missing date out', () => {
    expect(laPermitDates({ StartDate: null, EndDate: 0 })).toEqual({
      workStart: undefined,
      workEnd: undefined,
    });
  });
});

describe('laPermitNumber', () => {
  it('uses the permit number when the city filled one in', () => {
    expect(laPermitNumber({ ID: 7, PermitNo: 'U-2024-118', RefNo: 'R9' }, 'active')).toBe(
      'U-2024-118',
    );
  });

  it('skips a 0, blank or missing permit number for the reference number', () => {
    expect(laPermitNumber({ ID: 7, PermitNo: '0', RefNo: 'R9' }, 'active')).toBe('R9');
    expect(laPermitNumber({ ID: 7, PermitNo: 0, RefNo: 'R9' }, 'active')).toBe('R9');
    expect(laPermitNumber({ ID: 7, PermitNo: ' ', RefNo: 'R9' }, 'active')).toBe('R9');
  });

  it("falls back to the row's own ID, tagged with its layer, so rows never merge", () => {
    const a = laPermitNumber({ ID: 12, PermitNo: '0', RefNo: '0' }, 'point');
    const b = laPermitNumber({ ID: 13, PermitNo: '0', RefNo: null }, 'point');
    const c = laPermitNumber({ ID: 12, PermitNo: null, RefNo: null }, 'line');
    expect(new Set([a, b, c]).size).toBe(3);
    expect(a).toBe('point-12');
  });
});
