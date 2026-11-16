import { describe, expect, it } from 'vitest';
import { addressMatchKey, addressRangeKeys, streetsAgree } from './streets';

describe('addressMatchKey', () => {
  it("matches DC Water's spelling of an address to the locator's", () => {
    expect(addressMatchKey('800 F Street NW')).toBe(addressMatchKey('800 F ST NW'));
    expect(addressMatchKey('1600 Pennsylvania Avenue NW')).toBe(
      addressMatchKey('1600 PENNSYLVANIA AVE NW'),
    );
  });

  it('tells apart houses and quadrants', () => {
    expect(addressMatchKey('800 F St NW')).not.toBe(addressMatchKey('802 F St NW'));
    expect(addressMatchKey('800 F St NW')).not.toBe(addressMatchKey('800 F St NE'));
    expect(addressMatchKey('F Street NW')).toBeNull();
  });
});

describe('streetsAgree', () => {
  it('accepts the ways people type a street', () => {
    expect(streetsAgree('37th St', '37 STREET')).toBe(true);
    expect(streetsAgree('W 42nd St', 'WEST 42 STREET')).toBe(true);
    expect(streetsAgree('Avenue of the Americas', '6 AVENUE')).toBe(true);
    expect(streetsAgree('Main Street Brooklyn', 'MAIN STREET')).toBe(true);
    expect(streetsAgree('Springfield', 'SPRINGFIELD BOULEVARD')).toBe(true);
    expect(streetsAgree('St Marks Pl', "SAINT MARK'S PLACE")).toBe(true);
    expect(streetsAgree('Centre St', 'CENTER STREET')).toBe(true);
  });

  it('rejects a fallback to another street', () => {
    expect(streetsAgree('Nowhere Blvd Zzz', 'SPRINGFIELD BOULEVARD')).toBe(false);
    expect(streetsAgree('E 16th St', 'EAST 61 STREET')).toBe(false);
    expect(streetsAgree('Centre St', 'JAMAICA 1 PREK CENTER')).toBe(false);
  });
});

describe('addressRangeKeys', () => {
  it("reads SPU's ranges as every address on that side of the street", () => {
    expect(addressRangeKeys('4512-14 SUNNYSIDE AVE N')).toEqual([
      addressMatchKey('4512 Sunnyside Avenue N'),
      addressMatchKey('4514 Sunnyside Avenue N'),
    ]);
    expect(addressRangeKeys('98-102 MAIN ST')).toHaveLength(3);
  });

  it('keeps a plain address, and the first of a range that makes no sense', () => {
    expect(addressRangeKeys('2827 NW 75TH ST')).toEqual([addressMatchKey('2827 NW 75th Street')]);
    expect(addressRangeKeys('4512-10 SUNNYSIDE AVE N')).toEqual([
      addressMatchKey('4512 SUNNYSIDE AVE N'),
    ]);
    expect(addressRangeKeys('NO NUMBER')).toEqual([]);
  });
});
