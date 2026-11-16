import { describe, expect, it } from 'vitest';
import { dcServiceSide, worseSide } from './services';

describe('dcServiceSide', () => {
  it('reads DC Water categories', () => {
    expect(dcServiceSide('Verified Lead', 'Lead')).toEqual({
      material: 'lead',
      verified: true,
      pipe: 'Lead',
    });
    expect(dcServiceSide('Suspected Non-Lead', 'Copper')).toEqual({
      material: 'non-lead',
      verified: false,
      pipe: 'Copper',
    });
    expect(dcServiceSide('No Information', 'No Information')).toEqual({
      material: 'unknown',
      verified: false,
      pipe: 'Not recorded',
    });
  });

  it('calls galvanized iron filed under lead galvanized, unless lead is in it too', () => {
    expect(dcServiceSide('Verified Lead', 'Galvanized Iron').material).toBe('galvanized');
    expect(dcServiceSide('Verified Lead', 'Galvanized Iron with Lead').material).toBe('lead');
  });
});

describe('worseSide', () => {
  it('keeps the side that matters more to drinking water', () => {
    const copper = dcServiceSide('Verified Non-Lead', 'Copper');
    const lead = dcServiceSide('Suspected Lead', 'Lead');
    expect(worseSide(copper, lead)).toBe(lead);
    expect(worseSide(lead, copper)).toBe(lead);
  });
});
