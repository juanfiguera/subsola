import { describe, expect, it } from 'vitest';
import { addressParts, checkMatch, sameStreet } from './match';

describe('addressParts', () => {
  it('reads house numbers as people write them', () => {
    expect(addressParts('190C Main St, Bronx').number).toEqual({
      text: '190C',
      first: 190,
      last: 190,
    });
    expect(addressParts('4512-14 Fremont Ave N').number).toEqual({
      text: '4512-14',
      first: 4512,
      last: 4514,
    });
    expect(addressParts('25-87 37th St', { queens: true }).number).toEqual({
      text: '25-87',
      first: 2587,
      last: 2587,
    });
    expect(addressParts('Main St').number).toBeNull();
    expect(addressParts('117 West St, New York').street).toBe('West St');
  });
});

describe('sameStreet', () => {
  it('holds a direction typed before the street to the street found', () => {
    expect(sameStreet('N Spring St', 'SPRING STREET')).toBe(false);
    expect(sameStreet('N Spring St', 'North Spring Street')).toBe(true);
    expect(sameStreet('West St', 'WEST STREET')).toBe(true);
    expect(sameStreet('W 4th St', 'WEST 4 STREET')).toBe(true);
    expect(sameStreet('Bannock St', 'N Bannock St')).toBe(true);
    expect(sameStreet('Main St', 'Maine Ave')).toBe(false);
  });
});

describe('checkMatch', () => {
  it('turns down a different house number on the same street (the Boston case)', () => {
    expect(
      checkMatch('100 Main St, Boston', '190C MAIN STREET, Bronx, NY', { queens: true }),
    ).toEqual({
      problem: 'house-number',
      differs: true,
    });
  });

  it('takes the same number with or without a letter, and says it differs', () => {
    expect(checkMatch('190 Main St', '190C MAIN STREET, Bronx, NY', { queens: true })).toEqual({
      problem: null,
      differs: true,
    });
  });

  it("takes a Seattle duplex range's first address, but not one past its end", () => {
    expect(checkMatch('4512-14 Fremont Ave N, Seattle', '4512 Fremont Ave N, Seattle, WA')).toEqual(
      {
        problem: null,
        differs: true,
      },
    );
    expect(
      checkMatch('4512-14 Fremont Ave N', '4514 Fremont Ave N, Seattle, WA').problem,
    ).toBeNull();
    expect(checkMatch('4512-14 Fremont Ave N', '4516 Fremont Ave N, Seattle, WA').problem).toBe(
      'house-number',
    );
  });

  it('holds a Queens address to its whole number', () => {
    expect(
      checkMatch('25-87 37th St, Queens', '25-87 37 STREET, Astoria, NY', { queens: true }),
    ).toEqual({ problem: null, differs: false });
    expect(
      checkMatch('25-89 37th St, Queens', '25-87 37 STREET, Astoria, NY', { queens: true }).problem,
    ).toBe('house-number');
  });

  it('sees formatting as the same address', () => {
    expect(
      checkMatch('117 West St, New York', '117 WEST STREET, New York, NY', { queens: true }),
    ).toEqual({ problem: null, differs: false });
    expect(
      checkMatch('200 N Spring St, Los Angeles', '200 North Spring Street, Los Angeles, CA'),
    ).toEqual({ problem: null, differs: false });
    expect(checkMatch('1437 Bannock St Denver CO', '1437 Bannock St, Denver, CO')).toEqual({
      problem: null,
      differs: false,
    });
  });

  it('turns down a Manhattan Spring St for a Los Angeles N Spring St', () => {
    expect(
      checkMatch('200 N Spring St', '200 SPRING STREET, New York, NY', { queens: true }).problem,
    ).toBe('street');
  });

  it('answers an address with no number but says what was matched', () => {
    expect(checkMatch('Main St', '190C MAIN STREET, Bronx, NY', { queens: true })).toEqual({
      problem: null,
      differs: true,
    });
  });
});
