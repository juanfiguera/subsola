import { describe, expect, it } from 'vitest';
import { dalPermitSite, dalStreetName } from './build';

describe('dalPermitSite', () => {
  it("reads the first work site's street, number and how it reads", () => {
    expect(dalPermitSite('2653 CUSTER DR, DALLAS, 75216')).toEqual({
      sites: [{ street: 'CUSTER DR', number: 2653 }],
      place: '2653 Custer Dr',
      others: 0,
    });
  });

  it('reads every street a permit names, and counts the others', () => {
    const site = dalPermitSite(
      '11200-11600 DRUMMOND DR, 11200-11500 DUMBARTON DR, 3600 PARADER CT, DALLAS, 75229',
    );
    expect(site?.sites).toEqual([
      { street: 'DRUMMOND DR', number: 11200 },
      { street: 'DUMBARTON DR', number: 11200 },
      { street: 'PARADER CT', number: 3600 },
    ]);
    expect(site).toMatchObject({ place: '11200-11600 Drummond Dr', others: 2 });
  });

  it('tidies the spacing people type', () => {
    expect(dalPermitSite('3500   COMMERCE ST')).toMatchObject({
      sites: [{ street: 'COMMERCE ST', number: 3500 }],
      place: '3500 Commerce St',
    });
  });

  it('has nothing to say without a numbered site', () => {
    expect(dalPermitSite(null)).toBeNull();
    expect(dalPermitSite('DALLAS, 75201')).toBeNull();
  });
});

describe('dalStreetName', () => {
  it('writes the name as the address points do', () => {
    expect(dalStreetName({ prefix: 'N', name: 'CENTRAL', type: 'EXPY', suffix: null })).toBe(
      'N CENTRAL EXPY',
    );
    expect(dalStreetName({ prefix: null, name: 'MARILLA', type: 'ST', suffix: ' ' })).toBe(
      'MARILLA ST',
    );
    expect(dalStreetName({ prefix: 'N', name: null, type: 'ST', suffix: null })).toBe('');
  });
});
