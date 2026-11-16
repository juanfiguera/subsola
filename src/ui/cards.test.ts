import { describe, expect, it } from 'vitest';
import { prettyAddress } from './dom';

describe('prettyAddress', () => {
  it('reads NYC addresses the way people write them', () => {
    expect(prettyAddress('25-87 37 STREET')).toBe('25-87 37th St');
  });

  it('keeps DC quadrants in capitals', () => {
    expect(prettyAddress('800 F Street NW')).toBe('800 F St NW');
    expect(prettyAddress('1600 PENNSYLVANIA AVENUE NW')).toBe('1600 Pennsylvania Ave NW');
    expect(prettyAddress('507 7TH STREET NW')).toBe('507 7th St NW');
  });

  it('reads a DC block range as a block', () => {
    expect(prettyAddress('600 - 699 BLOCK OF 7TH STREET NW')).toBe('600 block of 7th St NW');
  });
});
