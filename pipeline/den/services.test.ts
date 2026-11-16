import { describe, expect, it } from 'vitest';
import { denLeadCategory, denSpokenAddress } from './services';

describe('denLeadCategory', () => {
  it("reads Denver Water's four categories", () => {
    expect(
      denLeadCategory('Confirmed lead service line; included in the Lead Reduction Program.'),
    ).toEqual({ material: 'lead', category: 'Confirmed lead' });
    expect(
      denLeadCategory(
        'Unknown; likely to have lead service line. Included in the Lead Reduction Program.',
      ),
    ).toEqual({ material: 'unknown', category: 'Likely lead' });
    expect(
      denLeadCategory(
        'Unknown; unlikely to have lead service line. Not included in the Lead Reduction Program.',
      ),
    ).toEqual({ material: 'unknown', category: 'Unlikely lead' });
    expect(
      denLeadCategory('No lead service line. Not included in Lead Reduction Program.'),
    ).toEqual({ material: 'non-lead', category: 'Not lead' });
  });

  it('drops the north-side N nobody says, and keeps the others', () => {
    expect(denSpokenAddress('15 N LOGAN ST')).toBe('15 LOGAN ST');
    expect(denSpokenAddress('4771 VINE ST')).toBe('4771 VINE ST');
    expect(denSpokenAddress('64 S WASHINGTON ST')).toBe('64 S WASHINGTON ST');
    expect(denSpokenAddress('1600 N BROADWAY')).toBe('1600 BROADWAY');
  });

  it('leaves a category it has never seen unread', () => {
    expect(denLeadCategory('Something new')).toBeNull();
    expect(denLeadCategory(null)).toBeNull();
  });
});
