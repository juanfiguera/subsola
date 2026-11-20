import { describe, expect, it } from 'vitest';
import { classifyDalPermit, dalContractor, OTHER_HOLDER } from './permits';

describe('classifyDalPermit', () => {
  it("takes the utility from the city's pick list and the owner from the company", () => {
    expect(classifyDalPermit('Gas', 'Atmos Energy', {})).toEqual({
      utility: 'gas',
      owner: 'Atmos Energy',
      assumed: false,
    });
    expect(classifyDalPermit('Electric', 'Oncor', { underground: 1 })).toMatchObject({
      utility: 'electric',
      owner: 'Oncor',
    });
    expect(classifyDalPermit('Wastewater', 'Dallas Water Utilities', {})).toMatchObject({
      utility: 'sewer',
      owner: 'Dallas Water Utilities',
    });
    expect(classifyDalPermit('Stormwater', 'City of Dallas', {})).toMatchObject({
      utility: 'sewer',
    });
    expect(classifyDalPermit('Telecommunications', 'AT&T', {})).toMatchObject({
      utility: 'telecom',
      owner: 'AT&T',
    });
  });

  it("files a contractor's gas dig as Atmos's line, and others under the holder", () => {
    expect(classifyDalPermit('Gas', null, {})).toMatchObject({ owner: 'Atmos Energy' });
    expect(classifyDalPermit('Water', null, {})).toMatchObject({
      utility: 'water',
      owner: OTHER_HOLDER,
    });
    // Oncor lays fiber for its own grid.
    expect(classifyDalPermit('Telecommunications', 'Oncor', {})).toMatchObject({
      utility: 'telecom',
      owner: 'Oncor',
    });
  });

  it('leaves out pole and lashing work that says nothing of going underground', () => {
    expect(classifyDalPermit('Electric', 'Oncor', { overhead: 1, underground: 0 })).toBe(
      'overhead',
    );
    expect(classifyDalPermit('Telecommunications', 'AT&T', { overhead: 1 })).toBe('overhead');
    // A riser and conduit down a pole is underground work too.
    expect(classifyDalPermit('Electric', 'Oncor', { overhead: 1, underground: 1 })).toMatchObject({
      utility: 'electric',
    });
    // Overhead words on a gas or water permit don't matter: those lines are all underground.
    expect(classifyDalPermit('Gas', 'Atmos Energy', { overhead: 1 })).toMatchObject({
      utility: 'gas',
    });
  });

  it("keeps Atmos's sewer camera checks as the sewer, without counting a dig", () => {
    expect(classifyDalPermit('Wastewater', null, { crossBore: 1, underground: 1 })).toEqual({
      utility: 'sewer',
      owner: 'Dallas Water Utilities',
      assumed: false,
      noOpening: 'cross bore check',
    });
  });

  it("keeps a utility's own paving as no dig, and leaves out everyone else's", () => {
    expect(classifyDalPermit('Street Paving', 'Atmos Energy', {})).toMatchObject({
      utility: 'gas',
      noOpening: 'paving',
    });
    expect(classifyDalPermit('Alley Paving', 'Dallas Water Utilities', {})).toMatchObject({
      utility: 'water',
      assumed: true,
      noOpening: 'paving',
    });
    expect(classifyDalPermit('Street Paving', 'City of Dallas', {})).toBe('not a utility');
    expect(classifyDalPermit('Drive Approach', null, {})).toBe('not a utility');
    expect(classifyDalPermit('Barrier-free ramp', 'City of Dallas', {})).toBe('not a utility');
  });

  it('counts an "Other" permit only when a utility holds it, and small cells never', () => {
    expect(classifyDalPermit('Other', null, {})).toBe('no utility named');
    expect(classifyDalPermit('Other', 'City of Dallas', {})).toBe('no utility named');
    expect(classifyDalPermit('Other', 'Dallas Water Utilities', { sewer: 1 })).toMatchObject({
      utility: 'sewer',
    });
    expect(classifyDalPermit('Other', 'Dallas Water Utilities', { water: 1 })).toMatchObject({
      utility: 'water',
      assumed: false,
    });
    // DWU's creek erosion repairs.
    expect(classifyDalPermit('Other', 'Dallas Water Utilities', {})).toBe('no utility named');
    expect(classifyDalPermit('Small Cell: Wooden Utility Pole', 'ExteNet', {})).toBe('small cell');
  });
});

describe('dalContractor', () => {
  it('names the first contractor that reads as a company', () => {
    expect(dalContractor('Primoris, Boardwalk Paving & Construction LLC, Driver Pipeline')).toBe(
      'Primoris',
    );
    expect(dalContractor('Boardwalk Paving & Construction, LLC')).toBe(
      'Boardwalk Paving & Construction, LLC',
    );
    expect(dalContractor('Omega Contracting')).toBe('Omega Contracting');
    expect(dalContractor('DRIVER PIPELINE')).toBe('DRIVER PIPELINE');
  });

  it('never names a person', () => {
    expect(dalContractor('Chris Combs')).toBeNull();
    expect(dalContractor('Chris Combs, Alejandro Flores')).toBeNull();
    expect(dalContractor('John Smith, Vasquez Utilities')).toBe('Vasquez Utilities');
    expect(dalContractor('PETER J. SMITH DBA ROYAL PLUMBING')).toBe('ROYAL PLUMBING');
    expect(dalContractor(null)).toBeNull();
  });
});
