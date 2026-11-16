import { describe, expect, it } from 'vitest';
import { OSM_FILTERS, osmAssetsFromElements } from './assets';

describe('osmAssetsFromElements', () => {
  it('turns manholes, lamps and signals into the matching fixtures', () => {
    const [manhole, lamp, signal] = osmAssetsFromElements([
      { id: 1, lat: 40.7, lon: -74, tags: { man_made: 'manhole', manhole: 'sewer' } },
      { id: 2, lat: 40.7, lon: -74, tags: { highway: 'street_lamp', operator: 'NYC DOT' } },
      { id: 3, lat: 40.7, lon: -74, tags: { highway: 'traffic_signals' } },
    ]);
    expect(manhole!.properties).toMatchObject({ kind: 'manhole', utility: 'sewer' });
    expect(lamp!.properties).toMatchObject({ kind: 'street-lamp', utility: 'electric' });
    expect(lamp!.properties.facts).toContainEqual(['Operator', 'NYC DOT']);
    expect(signal!.properties.kind).toBe('traffic-signal');
    expect(signal!.properties.signal!.osmNodes).toEqual([3]);
  });

  it('leaves a manhole with no utility hint unassigned', () => {
    const [manhole] = osmAssetsFromElements([
      { id: 4, lat: 40.7, lon: -74, tags: { man_made: 'manhole' } },
    ]);
    expect(manhole!.properties.utility).toBeNull();
  });
});

describe('OSM_FILTERS', () => {
  it('asks osmium for the manholes, lamps and signals the app draws', () => {
    expect(OSM_FILTERS).toEqual([
      'n/man_made=manhole',
      'n/highway=street_lamp',
      'n/highway=traffic_signals',
    ]);
  });
});
