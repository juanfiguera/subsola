import { describe, expect, it } from 'vitest';
import { citiesNamed, namedPlaces, placeProblem } from './placeNames';
import { DEN, LA, NYC, SEA } from '../../src/regions';

describe('namedPlaces', () => {
  it('keeps the places and drops states, ZIP codes and units', () => {
    expect(namedPlaces('117 West St, Apt 2, Brooklyn NY 11222')).toEqual(['Brooklyn']);
    expect(namedPlaces('33 Union Square West, New York, NY 10003')).toEqual([]);
    expect(namedPlaces('800 F St NW, Washington, DC')).toEqual([]);
    expect(namedPlaces('1420 5th Ave, Seattle, WA 98101')).toEqual(['Seattle']);
    expect(namedPlaces('100 Main St, Boston, MA')).toEqual(['Boston']);
    expect(namedPlaces('200 N Spring St, Los Angeles CA, USA')).toEqual(['Los Angeles']);
  });
});

describe('citiesNamed', () => {
  it('reads boroughs and neighborhoods as their city', () => {
    expect(citiesNamed('1 Main St, Hollywood')).toEqual(['la']);
    expect(citiesNamed('5000 Ballard Ave NW, Ballard')).toEqual(['sea']);
    expect(citiesNamed('117 West St, Staten Island')).toEqual(['nyc']);
    expect(citiesNamed('100 E Pine St, Capitol Hill')).toEqual(['dc', 'sea', 'den']);
    expect(citiesNamed('100 E Pine St, Capitol Hill, Seattle')).toEqual(['sea']);
    expect(citiesNamed('100 Main St, Boston')).toBeNull();
  });
});

describe('placeProblem', () => {
  const brooklyn = { label: '117 WEST STREET, Brooklyn, NY', borough: 'Brooklyn' };
  const manhattan = { label: '117 WEST STREET, New York, NY', borough: 'Manhattan' };

  it('holds a named borough to the borough found', () => {
    expect(placeProblem('117 West St, Brooklyn', NYC, brooklyn)).toBeNull();
    expect(placeProblem('117 West St, Brooklyn', NYC, manhattan)).toEqual({
      kind: 'other-borough',
      place: 'Brooklyn',
      borough: 'Manhattan',
    });
    expect(placeProblem('117 West St, Manhattan', NYC, manhattan)).toBeNull();
    expect(placeProblem('117 West St, New York', NYC, manhattan)).toBeNull();
    expect(
      placeProblem('190 Main St, Bronx', NYC, {
        label: '190 MAIN STREET, Staten Island, NY',
        borough: 'Staten Island',
      }),
    ).toMatchObject({ kind: 'other-borough' });
  });

  it('turns down a place outside the covered cities, unless the match carries it', () => {
    const bronx = { label: '190C MAIN STREET, Bronx, NY', borough: 'Bronx' };
    expect(placeProblem('100 Main St, Boston', NYC, bronx)).toEqual({
      kind: 'unknown-place',
      place: 'Boston',
    });
    expect(placeProblem('1 Main St, Boston, MA', NYC, bronx)).toEqual({ kind: 'other-state' });
    expect(
      placeProblem('25-87 37th St, Ditmars', NYC, {
        label: '25-87 37 STREET, Ditmars, NY',
        borough: 'Queens',
      }),
    ).toBeNull();
  });

  it("turns down another covered city's neighborhood", () => {
    expect(
      placeProblem('1 Main St, Hollywood', NYC, {
        label: '1 MAIN STREET, Brooklyn, NY',
        borough: 'Brooklyn',
      }),
    ).toEqual({ kind: 'other-city', place: 'Hollywood', regions: ['la'] });
    expect(
      placeProblem('6000 Hollywood Blvd, Hollywood', LA, {
        label: '6000 Hollywood Boulevard, Los Angeles, CA',
        borough: 'LOS ANGELES',
      }),
    ).toBeNull();
    expect(
      placeProblem('1437 Bannock St, Denver, CO 80202', DEN, {
        label: '1437 Bannock St, Denver, CO',
        borough: 'DENVER',
      }),
    ).toBeNull();
    expect(
      placeProblem('1420 5th Ave, Seattle, Washington', SEA, {
        label: '1420 5th Ave, Seattle, WA',
        borough: 'SEATTLE',
      }),
    ).toBeNull();
  });
});
