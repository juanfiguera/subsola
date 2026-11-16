import { describe, expect, it } from 'vitest';
import { mergeSignals, signalAsset, signalsFromRows } from './signals';

// About 11 m of latitude per 0.0001 degree.
const point = (lat: number) => ({
  type: 'Point' as const,
  coordinates: [-74.0, lat] as [number, number],
});

describe('signalsFromRows', () => {
  it('makes one signal of an intersection listed in several DOT datasets', () => {
    const signals = signalsFromRows({
      signalsLpi: [
        {
          the_geom: point(40.7),
          main_street: '86 Street',
          cross_stree: '7 Avenue',
          install_da: '2020-06-04T00:00:00',
        },
      ],
      signalsAccessible: [
        {
          the_geom: point(40.70005),
          location: '7 Avenue and  86 Street',
          date_insta: '2023-11-03',
        },
      ],
      signalsExclusive: [{ the_geom: point(40.71), barnes_dan: 'X' }],
    });
    expect(signals).toHaveLength(2);
    const [corner, farther] = signals;
    expect(corner!.properties.signal).toMatchObject({
      name: '86 Street & 7 Avenue',
      sources: ['signalsLpi', 'signalsAccessible'],
    });
    expect(corner!.properties.facts).toContainEqual([
      'Leading pedestrian interval',
      'Since Jun 4, 2020',
    ]);
    expect(corner!.properties.facts).toContainEqual([
      'Accessible pedestrian signal',
      'Since Nov 3, 2023',
    ]);
    expect(farther!.properties.facts).toContainEqual([
      'Exclusive pedestrian phase',
      'Barnes Dance (all-way walk)',
    ]);
  });
});

describe('mergeSignals', () => {
  const dot = signalAsset([-74.0, 40.7], {
    name: 'A & B',
    features: [['Leading pedestrian interval', 'Yes']],
    sources: ['signalsLpi'],
    osmNodes: [],
  });
  const osmNode = (lat: number, id: number) =>
    signalAsset([-74.0, lat], { features: [], sources: [], osmNodes: [id] });

  it('folds nearby OpenStreetMap nodes into the DOT signal and keeps its position', () => {
    const [signal, ...rest] = mergeSignals([dot], [osmNode(40.7002, 1), osmNode(40.6998, 2)]);
    expect(rest).toEqual([]);
    expect(signal!.geometry.coordinates).toEqual([-74.0, 40.7]);
    expect(signal!.properties.signal!.osmNodes).toEqual([1, 2]);
    expect(signal!.properties.facts).toContainEqual(['OpenStreetMap', '2 nodes']);
  });

  it('moves an OpenStreetMap-only signal to a DOT point when one arrives', () => {
    const [signal] = mergeSignals([osmNode(40.7002, 1)], [dot]);
    expect(signal!.geometry.coordinates).toEqual([-74.0, 40.7]);
    expect(signal!.properties.sourceKey).toBe('signalsLpi');
  });

  it('keeps signals a block apart separate', () => {
    expect(mergeSignals([dot], [osmNode(40.701, 3)])).toHaveLength(2);
  });
});
