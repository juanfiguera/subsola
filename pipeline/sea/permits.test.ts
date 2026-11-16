import { describe, expect, it } from 'vitest';
import { classifySeaPermit } from './permits';

const GAS_USE =
  'Installing or maintaining  natural gas lines and short segments [less than 100 lineal feet] of natural gas mains';

describe('classifySeaPermit', () => {
  it('reads the utility from the company that held the permit', () => {
    expect(classifySeaPermit('Puget Sound Energy', 'Utility Infrastructure', GAS_USE)).toEqual({
      utility: 'gas',
      owner: 'Puget Sound Energy',
      assumed: false,
    });
    expect(classifySeaPermit('Seattle City Light', null, null)?.utility).toBe('electric');
    expect(classifySeaPermit('Century Link', null, null)?.owner).toBe('CenturyLink');
    expect(classifySeaPermit('Qwest DBA CenturyLink', null, null)?.owner).toBe('CenturyLink');
    expect(classifySeaPermit('Comcast', null, null)?.utility).toBe('telecom');
  });

  it("sorts SPU's water from its sewer work, and marks it assumed when it doesn't say", () => {
    expect(
      classifySeaPermit('Seattle Public Utilities', null, 'Emergency sewer repair.')?.utility,
    ).toBe('sewer');
    expect(
      classifySeaPermit(
        'Seattle Public Utilities',
        'Utility Infrastructure',
        'Installing or maintaining water lines by a public utility agency',
      ),
    ).toEqual({ utility: 'water', owner: 'Seattle Public Utilities', assumed: false });
    expect(classifySeaPermit('Seattle Public Utilities', null, null)).toEqual({
      utility: 'water',
      owner: 'Seattle Public Utilities',
      assumed: true,
    });
  });

  it('files side sewer work as sewer and leaves other contractors out', () => {
    expect(classifySeaPermit('BOB OATES SEWER ROOTER', null, null)?.utility).toBe('sewer');
    expect(classifySeaPermit('Some Builder LLC', 'Side Sewer/Drainage', null)?.utility).toBe(
      'sewer',
    );
    expect(classifySeaPermit('Gary Merlino Construction Company', null, 'ADA ramps')).toBeNull();
  });
});
