import { describe, expect, it } from 'vitest';
import { matchesStreet, parseLocationNote, streetKey } from './locationNotes';

describe('parseLocationNote', () => {
  it('reads both offsets from a crew note, ignoring the job numbers after them', () => {
    expect(
      parseLocationNote("0' NNC OF 28 AVE & 4' WEC OF 37TH ST (QG16007163-P1/P2) **QEC-17-048**"),
    ).toEqual([
      { feet: 0, toward: 'N', curb: 'N', street: '28 AVE' },
      { feet: 4, toward: 'W', curb: 'E', street: '37TH ST' },
    ]);
  });

  it('reads a bare street name and a long distance', () => {
    expect(parseLocationNote("315' NNC OF 30 AVENUE & 0' EWC OF STEINWAY ST")).toEqual([
      { feet: 315, toward: 'N', curb: 'N', street: '30 AVENUE' },
      { feet: 0, toward: 'E', curb: 'W', street: 'STEINWAY ST' },
    ]);
    expect(parseLocationNote("0' NSC OF 28TH AVE & 1' WEC OF STEINWAY")[1]?.street).toBe(
      'STEINWAY',
    );
  });

  it('finds nothing in notes without curb offsets', () => {
    expect(
      parseLocationNote('WR 100510077 - INSTALL GAS SERVICE - F/O 28-43 STEINWAY STREET.'),
    ).toEqual([]);
  });
});

describe('street names', () => {
  it('matches crew spellings to DOT names', () => {
    expect(streetKey('37TH ST')).toBe('37 STREET');
    expect(matchesStreet('28 AVE', '28 AVENUE')).toBe(true);
    expect(matchesStreet('STEINWAY', 'STEINWAY STREET')).toBe(true);
    expect(matchesStreet('37 ST', '38 STREET')).toBe(false);
  });
});
