import { describe, expect, it } from 'vitest';
import { coverageCard, coverageMessage } from './coverage';
import { outsideCoverage } from './outsideCoverage';
import { DEN, NYC } from '../regions';
import type { GeocodedAddress } from '../sources/geocode';

const brooklyn: GeocodedAddress = {
  label: '1 Main Street, Brooklyn, NY, USA',
  lngLat: [-73.99, 40.7],
  street: 'MAIN STREET',
  borough: 'Brooklyn',
  bbl: undefined,
};

describe('outsideCoverage', () => {
  it('catches another state that New York answered anyway', () => {
    expect(outsideCoverage('1 Main St, Boston, MA', { address: brooklyn, region: NYC })).toEqual({
      kind: 'other-state',
      typed: '1 Main St, Boston, MA',
    });
  });

  it('catches a city Subsola does not cover', () => {
    expect(outsideCoverage('1 Main St, Hoboken', { address: brooklyn, region: NYC })).toEqual({
      kind: 'unknown-place',
      typed: '1 Main St, Hoboken',
      place: 'Hoboken',
    });
  });

  it('lets a covered city or borough through', () => {
    expect(outsideCoverage('1 Main St, Brooklyn', { address: brooklyn, region: NYC })).toBeNull();
    expect(outsideCoverage('1 Main St', { address: brooklyn, region: NYC })).toBeNull();
  });

  it('explains a miss no geocoder answered', () => {
    expect(outsideCoverage('12 Elm St, Portland, OR', null)).toMatchObject({
      kind: 'unknown-place',
      place: 'Portland',
    });
    expect(outsideCoverage('12 Elm St 97201', null)).toEqual({
      kind: 'other-state',
      typed: '12 Elm St 97201',
    });
    expect(outsideCoverage('12 Nowhere Lane', null)).toBeNull();
  });
});

describe('coverageMessage', () => {
  it('names every covered city when nothing was found', () => {
    const { text } = coverageMessage({ kind: 'not-found', typed: '12 Nowhere Lane' });
    expect(text).toContain('Couldn\'t find "12 Nowhere Lane" in New York City');
    expect(text).toContain('Chicago');
    expect(text).toContain('open the city map');
  });

  it('words an outside place the way the MCP server does', () => {
    expect(
      coverageMessage({ kind: 'unknown-place', typed: '1 Main St, Hoboken', place: 'Hoboken' })
        .text,
    ).toMatch(
      /^"Hoboken" isn't one of the cities Subsola covers \(New York City, .*, Chicago, and Dallas\)/,
    );
  });

  it('says a street without records is not a clear street', () => {
    const { title, text } = coverageMessage({
      kind: 'no-records',
      address: '9 Far St',
      region: DEN,
    });
    expect(title).toBe('No records for this street yet');
    expect(text).toContain('Found 9 Far St in Denver');
    expect(text).toContain("doesn't mean the street is clear");
  });
});

describe('coverageCard', () => {
  it('offers the city map and a way back', () => {
    const html = coverageCard({ kind: 'not-found', typed: 'x' }, '33 Union Square West');
    expect(html).toContain('data-action="open-city"');
    expect(html).toContain('Back to 33 Union Square West');
  });

  it('escapes what was typed', () => {
    expect(coverageCard({ kind: 'not-found', typed: '<b>' }, null)).not.toContain('<b>');
  });
});
