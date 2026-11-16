import { describe, expect, it, vi } from 'vitest';
import { findAddress } from './findAddress';
import { DEN, LA, NYC, SD, SEA, type Region } from '../../src/regions';
import type { GeocodedAddress } from '../../src/sources/geocode';

/**
 * Each city's geocoder replaced by what it really answered for these addresses on 2026-11-11
 * (probed live), so the checks run on real lookalikes without the network.
 */

type Answers = Record<string, Omit<GeocodedAddress, 'bbl' | 'street'> | undefined>;

const fake = (region: Region, answers: Answers) => ({
  ...region,
  geocode: vi.fn(async (text: string) => {
    const answer = answers[text];
    if (!answer) throw new Error('no match');
    return { ...answer, street: undefined, bbl: undefined };
  }),
});

// Inside each city's bounds.
const IN = {
  bronx: [-73.83, 40.84] as [number, number],
  manhattan: [-74.013, 40.709] as [number, number],
  brooklyn: [-73.96, 40.73] as [number, number],
  statenIsland: [-74.08, 40.6] as [number, number],
  la: [-118.243, 34.054] as [number, number],
  sd: [-117.16, 32.72] as [number, number],
  sea: [-122.35, 47.66] as [number, number],
  den: [-104.99, 39.74] as [number, number],
};

const nyc = fake(NYC, {
  '100 Main St, Boston': {
    label: '190C MAIN STREET, Bronx, NY',
    lngLat: IN.bronx,
    borough: 'Bronx',
  },
  '100 Main St': { label: '190C MAIN STREET, Bronx, NY', lngLat: IN.bronx, borough: 'Bronx' },
  '117 West St, New York': {
    label: '117 WEST STREET, New York, NY',
    lngLat: IN.manhattan,
    borough: 'Manhattan',
  },
  '117 West St': {
    label: '117 WEST STREET, New York, NY',
    lngLat: IN.manhattan,
    borough: 'Manhattan',
  },
  // Asked for Brooklyn, a geocoder that settled on Manhattan's West St.
  '117 West St, Brooklyn': {
    label: '117 WEST STREET, New York, NY',
    lngLat: IN.manhattan,
    borough: 'Manhattan',
  },
  '190 Main St, Bronx': {
    label: '190 MAIN STREET, Staten Island, NY',
    lngLat: IN.statenIsland,
    borough: 'Staten Island',
  },
  '200 N Spring St': {
    label: '200 SPRING STREET, New York, NY',
    lngLat: IN.manhattan,
    borough: 'Manhattan',
  },
  '4512-14 Fremont Ave N, Seattle': {
    label: '4512 AVENUE N, Brooklyn, NY',
    lngLat: IN.brooklyn,
    borough: 'Brooklyn',
  },
});
const la = fake(LA, {
  '200 N Spring St': {
    label: '200 North Spring Street, Los Angeles, CA',
    lngLat: IN.la,
    borough: 'LOS ANGELES',
  },
});
const sd = fake(SD, {
  '117 West St': { label: '117 West St, San Diego, CA', lngLat: IN.sd, borough: 'SAN DIEGO' },
});
const sea = fake(SEA, {
  '4512-14 Fremont Ave N, Seattle': {
    label: '4512 Fremont Ave N, Seattle, WA',
    lngLat: IN.sea,
    borough: 'SEATTLE',
  },
});
const den = fake(DEN, {
  '1437 Bannock St, Denver': {
    label: '1437 Bannock St, Denver, CO',
    lngLat: IN.den,
    borough: 'DENVER',
  },
});
const regions = [nyc, la, sd, sea, den];

describe('findAddress', () => {
  it('turns down a Bronx lookalike for a Boston address', async () => {
    expect(await findAddress('100 Main St, Boston', { regions })).toEqual({
      ok: false,
      reason: 'not-found',
      problem: { kind: 'unknown-place', place: 'Boston' },
    });
    expect(await findAddress('100 Main St', { regions })).toEqual({
      ok: false,
      reason: 'not-found',
      problem: { kind: 'house-number', found: '190C MAIN STREET, Bronx, NY', region: 'nyc' },
    });
  });

  it('finds 117 West St in Manhattan, and not when Brooklyn was asked for', async () => {
    expect(await findAddress('117 West St, New York', { regions })).toMatchObject({
      ok: true,
      region: { id: 'nyc' },
      differs: false,
    });
    expect(await findAddress('117 West St, Brooklyn', { regions })).toEqual({
      ok: false,
      reason: 'not-found',
      problem: { kind: 'other-borough', place: 'Brooklyn', borough: 'Manhattan' },
    });
    expect(await findAddress('190 Main St, Bronx', { regions })).toMatchObject({
      ok: false,
      problem: { kind: 'other-borough', borough: 'Staten Island' },
    });
  });

  it('asks only the city given', async () => {
    expect(await findAddress('117 West St', { regions, city: 'sd' })).toMatchObject({
      ok: true,
      region: { id: 'sd' },
      address: { label: '117 West St, San Diego, CA' },
    });
    expect(await findAddress('1437 Bannock St, Denver', { regions, city: 'nyc' })).toMatchObject({
      ok: false,
      problem: { kind: 'city-mismatch', place: 'Denver', regions: ['den'], city: 'nyc' },
    });
  });

  it("passes over Manhattan's Spring St for Los Angeles's N Spring St", async () => {
    expect(await findAddress('200 N Spring St', { regions })).toMatchObject({
      ok: true,
      region: { id: 'la' },
      differs: false,
    });
  });

  it('takes a Seattle duplex at its first number and says the match differs', async () => {
    expect(await findAddress('4512-14 Fremont Ave N, Seattle', { regions })).toMatchObject({
      ok: true,
      region: { id: 'sea' },
      address: { label: '4512 Fremont Ave N, Seattle, WA' },
      differs: true,
    });
    // Seattle is named, so New York's Avenue N is never asked.
    expect(nyc.geocode).not.toHaveBeenCalledWith('4512-14 Fremont Ave N, Seattle', undefined);
  });

  it('finds Denver addresses', async () => {
    expect(await findAddress('1437 Bannock St, Denver', { regions })).toMatchObject({
      ok: true,
      region: { id: 'den' },
      differs: false,
    });
  });

  it('turns down places from two different cities', async () => {
    expect(await findAddress('1 Main St, Ballard, Los Angeles', { regions })).toMatchObject({
      ok: false,
      problem: { kind: 'other-city' },
    });
  });

  it('reports a timeout rather than a miss', async () => {
    const slow = {
      ...NYC,
      geocode: async () => {
        throw new DOMException('timed out', 'TimeoutError');
      },
    };
    expect(await findAddress('117 West St', { regions: [slow] })).toEqual({
      ok: false,
      reason: 'timeout',
    });
  });
});
