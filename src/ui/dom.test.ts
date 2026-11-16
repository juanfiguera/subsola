import { describe, expect, it } from 'vitest';
import { ownerName, streetName } from './dom';

describe('streetName', () => {
  it('keeps a DC quadrant in capitals', () => {
    expect(streetName('F ST NW')).toBe('F St NW');
    expect(streetName('7TH ST NW')).toBe('7th St NW');
  });

  it('spells numbered streets the way people say them', () => {
    expect(streetName('37 ST')).toBe('37th St');
    expect(streetName('28 AVE')).toBe('28th Ave');
    expect(streetName('W 21 ST')).toBe('W 21st St');
    expect(streetName('E 112 ST')).toBe('E 112th St');
    expect(streetName('3 AVE')).toBe('3rd Ave');
  });

  it('leaves named streets alone', () => {
    expect(streetName('MOTT ST')).toBe('Mott St');
    expect(streetName('ASTORIA BLVD')).toBe('Astoria Blvd');
  });
});

describe('ownerName', () => {
  it('names National Grid under its old filing names', () => {
    expect(ownerName('KEYSPAN ENERGY DELIVERY N.Y.C.')).toBe('National Grid');
    expect(ownerName('THE BROOKLYN UNION GAS COMPANY D/B/A NATIONAL GRID NY')).toBe(
      'National Grid',
    );
    expect(ownerName('CONSOLIDATED EDISON')).toBe('Consolidated Edison');
  });

  it('keeps DC in capitals', () => {
    expect(ownerName('DC Water')).toBe('DC Water');
    expect(ownerName('Astound (RCN)')).toBe('Astound (RCN)');
    expect(ownerName('AT&T')).toBe('AT&T');
  });
});
