import { describe, expect, it } from 'vitest';
import { cityIdOf, cityInput } from './cityInput';
import { REGIONS } from '../../src/regions';

describe('cityIdOf', () => {
  it.each([
    ['nyc', 'nyc'],
    ['New York City', 'nyc'],
    ['new york', 'nyc'],
    ['NYC', 'nyc'],
    ['N.Y.C.', 'nyc'],
    ['Manhattan', 'nyc'],
    ['Brooklyn', 'nyc'],
    ['Queens', 'nyc'],
    ['Bronx', 'nyc'],
    ['the bronx', 'nyc'],
    ['Staten  Island', 'nyc'],
    ['dc', 'dc'],
    ['Washington', 'dc'],
    ['Washington DC', 'dc'],
    ['Washington, D.C.', 'dc'],
    ['DC', 'dc'],
    ['D.C.', 'dc'],
    ['SF', 'sf'],
    ['san francisco', 'sf'],
    ['LA', 'la'],
    ['Los Angeles', 'la'],
    ['  los   angeles ', 'la'],
    ['San Diego', 'sd'],
    ['SD', 'sd'],
    ['Seattle', 'sea'],
    ['SEA', 'sea'],
    ['Denver', 'den'],
    ['den', 'den'],
    ['Chicago', 'chi'],
    ['Dallas', 'dal'],
    ['DAL', 'dal'],
    ['San Jose', 'sj'],
    ['San José', 'sj'],
    ['sj', 'sj'],
    ['CHI', 'chi'],
  ])('reads %j as %s', (text, id) => {
    expect(cityIdOf(text)).toBe(id);
  });

  it("reads every region's id, name and short name", () => {
    for (const region of REGIONS)
      for (const name of [region.id, region.name, region.short])
        expect(cityIdOf(name)).toBe(region.id);
  });

  it.each(['Boston', 'York', 'Washington State', 'San', ''])('knows %j is no city', (text) => {
    expect(cityIdOf(text)).toBeNull();
  });
});

describe('cityInput', () => {
  it('turns a full name into the id and leaves it optional', () => {
    expect(cityInput.parse('Los Angeles')).toBe('la');
    expect(cityInput.parse(undefined)).toBeUndefined();
  });

  it('names every covered city when it fails', () => {
    const parsed = cityInput.safeParse('Boston');
    expect(parsed.success).toBe(false);
    const message = parsed.error!.issues[0]!.message;
    expect(message).toContain('"Boston"');
    for (const region of REGIONS) expect(message).toContain(`"${region.id}" (${region.name})`);
  });
});
