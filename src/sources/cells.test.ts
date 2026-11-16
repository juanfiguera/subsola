import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCell } from './cells';
import { fetchConEdStructures } from './conEd';
import { isPaused, pausedNote, PAUSED_SOURCES } from './catalog';
import type { GridCell } from '../grid';

const line = {
  type: 'MultiLineString',
  coordinates: [
    [
      [-77.02, 38.9],
      [-77.01, 38.9],
    ],
  ],
};

// A cell built before the pause, still carrying DC Water's mains, Con Edison's structures and
// San Diego's street lamps beside layers that stay.
const oldCell = {
  v: 1,
  key: 'test',
  mains: [
    { id: 'dc-1', source: 'dcMains', the_geom: line },
    { id: 'sd-1', utility: 'sewer', source: 'sdSewers', the_geom: line },
  ],
  conEdStructures: [{ STRUCT_NUMBER: 'M123', LATITUDE: 40.75, LONGITUDE: -73.98 }],
  assets: [
    {
      kind: 'street-lamp',
      utility: null,
      title: 'Street lamp',
      facts: [],
      source: 'sdLights',
      lngLat: [-117.16, 32.71],
    },
    {
      kind: 'hydrant',
      utility: 'water',
      title: 'Hydrant',
      facts: [],
      source: 'sdHydrants',
      lngLat: [-117.16, 32.71],
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('paused sources', () => {
  it('are the layers whose terms forbid republishing, each with its owner and a lookup link', () => {
    expect(Object.keys(PAUSED_SOURCES).sort()).toEqual(
      [
        'conEdStructures',
        'dcMains',
        'dcServiceLines',
        'denServiceLines',
        'sdLights',
        'sdServiceLines',
        'sdSignals',
      ].sort(),
    );
    expect(isPaused('sdHydrants')).toBe(false);
    expect(pausedNote('denServiceLines')).toBe(
      "Not shown while Subsola asks Denver Water for permission to republish it. Look it up on Denver Water's own site: https://www.denverwater.org/lead",
    );
  });

  it('are dropped from a cell built before the pause, on every path that reads cells', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(oldCell))),
    );
    const data = await fetchCell('https://data.example', { key: 'test' } as GridCell);
    expect(data.mains.map((main) => main.source)).toEqual(['sdSewers']);
    expect(data.assets.map((asset) => asset.properties.sourceKey)).toEqual(['sdHydrants']);
  });

  it("never asks Con Edison's server while its map is paused", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await fetchConEdStructures([-73.98, 40.75], 200)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
