import { describe, expect, it } from 'vitest';
import { classifyDenPermit, DEN_DIG_PURPOSES } from './permits';
import { denPermitDates } from './build';

describe('classifyDenPermit', () => {
  it('takes the utility from a purpose that names it', () => {
    expect(classifyDenPermit('Street Cut - Water', 'DENVER WATER BOARD')).toEqual({
      utility: 'water',
      owner: 'Denver Water',
      assumed: false,
    });
    expect(classifyDenPermit('Street Cut - Water', 'APEX PLUMBING INC')).toEqual({
      utility: 'water',
      owner: 'Other permit holder',
      assumed: false,
    });
    expect(classifyDenPermit('Sanitary Sewer', 'SEWER LINES ONLY LP')?.utility).toBe('sewer');
    expect(classifyDenPermit('Fiber Optics', 'PAULEY CONSTRUCTION LLC')?.utility).toBe('telecom');
    expect(classifyDenPermit('Fiber Optics', 'CENTURYLINK COMMUNICATIONS LLC')?.owner).toBe(
      'Lumen (CenturyLink)',
    );
    expect(classifyDenPermit('Fire Hydrant', null)?.utility).toBe('water');
  });

  it("reads Xcel's cable as power and its fiber as telecom", () => {
    expect(classifyDenPermit('Cable', 'Xcel Energy')).toEqual({
      utility: 'electric',
      owner: 'Xcel Energy',
      assumed: false,
    });
    expect(classifyDenPermit('Fiber Optics', 'Xcel Energy')?.utility).toBe('telecom');
    expect(classifyDenPermit('Cable', 'COMCAST CABLE')?.utility).toBe('telecom');
  });

  it('reads the company where the purpose is only "Utility"', () => {
    expect(classifyDenPermit('Utility', 'DENVER WATER BOARD')?.utility).toBe('water');
    expect(classifyDenPermit('Utility', 'QWEST - NORTH OF ALAMEDA')).toEqual({
      utility: 'telecom',
      owner: 'Lumen (CenturyLink)',
      assumed: false,
    });
    expect(classifyDenPermit('Utility', 'SAGE TELECOMMUNICATIONS CORP')?.utility).toBe('telecom');
    expect(
      classifyDenPermit('Street Cut - Utilities', 'CCD (CPM WW) & BT Construction Inc'),
    ).toEqual({ utility: 'sewer', owner: 'Denver Wastewater', assumed: false });
    expect(classifyDenPermit('Utility', 'AFFORD-A-ROOTER')?.utility).toBe('sewer');
  });

  it("sorts Xcel's gas from its power by the contractor, and marks it assumed when nothing says", () => {
    expect(classifyDenPermit('Street Cut - Utilities', 'XCEL ENERGY - AMRP/CAB')).toEqual({
      utility: 'gas',
      owner: 'Xcel Energy',
      assumed: false,
    });
    expect(classifyDenPermit('Utility', 'XCEL ENERGY-CENTRAL METRO/SITEWISE')?.utility).toBe('gas');
    expect(classifyDenPermit('Utility', 'XCEL ENERGY-CENTRAL METRO/STURGEON ELECTRIC')).toEqual({
      utility: 'electric',
      owner: 'Xcel Energy',
      assumed: false,
    });
    expect(classifyDenPermit('Utility', 'MEARS GROUP INC')).toEqual({
      utility: 'gas',
      owner: 'Other permit holder',
      assumed: false,
    });
    expect(classifyDenPermit('Utility', 'HOOPER CORPORATION')?.utility).toBe('electric');
    expect(classifyDenPermit('Utility', 'XCEL ENERGY-CENTRAL METRO')).toEqual({
      utility: 'gas',
      owner: 'Xcel Energy',
      assumed: true,
    });
    // Not a known contractor, but the holder names its trade.
    expect(classifyDenPermit('Utility', 'XCEL ENERGY - ACME POWER LINE')).toEqual({
      utility: 'electric',
      owner: 'Xcel Energy',
      assumed: false,
    });
  });

  it("leaves out work that doesn't cut the street for a utility", () => {
    expect(classifyDenPermit('Dumpster', 'DENVER WATER BOARD')).toBeNull();
    expect(classifyDenPermit('Crane Service', 'XCEL ENERGY-CENTRAL METRO')).toBeNull();
    expect(classifyDenPermit('Pot Holing', 'DENVER WATER BOARD')).toBeNull();
    expect(classifyDenPermit('Aerial Cable', 'COMCAST')).toBeNull();
    expect(classifyDenPermit(null, null)).toBeNull();
    // Paving and building contractors file "ROW Construction" too.
    expect(classifyDenPermit('ROW Construction', 'DENVER CONCRETE WORKS INC')).toBeNull();
    // The city's own signal work, built by an electrical contractor.
    expect(
      classifyDenPermit('Utility', 'CCD (Transportation) & Sturgeon Electric Company Inc'),
    ).toBeNull();
    expect(classifyDenPermit('ROW Construction', 'CCD (CPM Trans) & PCL')).toBeNull();
  });

  it('asks the download for every purpose it reads', () => {
    expect(DEN_DIG_PURPOSES).toContain('Street Cut - Water');
    expect(DEN_DIG_PURPOSES).toContain('Utility');
    expect(DEN_DIG_PURPOSES).not.toContain('Dumpster');
  });
});

describe('denPermitDates', () => {
  it('reads the closure window as work dates, with no issue date', () => {
    const dates = denPermitDates({
      BEGIN_DATE: Date.UTC(2026, 2, 2),
      END_DATE: Date.UTC(2026, 2, 6),
    });
    expect(dates).toEqual({ workStart: '2026-03-02', workEnd: '2026-03-06' });
    expect(dates).not.toHaveProperty('issued');
  });

  it("runs a permit's several closures from the earliest start", () => {
    const first = denPermitDates({
      BEGIN_DATE: Date.UTC(2026, 2, 9),
      END_DATE: Date.UTC(2026, 2, 13),
    });
    expect(
      denPermitDates({ BEGIN_DATE: Date.UTC(2026, 2, 2), END_DATE: Date.UTC(2026, 2, 20) }, first),
    ).toEqual({ workStart: '2026-03-02', workEnd: '2026-03-20' });
    expect(denPermitDates({ BEGIN_DATE: Date.UTC(2026, 2, 16), END_DATE: null }, first)).toEqual({
      workStart: '2026-03-09',
      workEnd: '2026-03-13',
    });
  });

  it('drops a date outside the years the layer holds cleanly', () => {
    expect(denPermitDates({ BEGIN_DATE: Date.UTC(1999, 0, 1), END_DATE: null }).workStart).toBe(
      undefined,
    );
  });
});
