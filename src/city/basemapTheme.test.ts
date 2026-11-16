import { describe, expect, it } from 'vitest';
import { darkBasemap, darkFill, parseColor, type BasemapLayer } from './basemapTheme';

const lightnessOf = (value: unknown) => parseColor(value as string)!.l;

// A slice of OpenFreeMap's positron, as it was fetched on 2026-11-10.
const POSITRON: BasemapLayer[] = [
  { id: 'background', type: 'background', paint: { 'background-color': 'rgb(242,243,240)' } },
  {
    id: 'water',
    type: 'fill',
    paint: { 'fill-antialias': true, 'fill-color': 'rgb(194, 200, 202)' },
  },
  {
    id: 'building',
    type: 'fill',
    paint: { 'fill-color': 'rgb(234, 234, 229)', 'fill-outline-color': 'rgb(219, 219, 218)' },
  },
  {
    id: 'highway_major_inner',
    type: 'line',
    paint: {
      'line-color': '#fff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 20, 20],
    },
  },
  {
    id: 'highway_motorway_inner',
    type: 'line',
    paint: {
      'line-color': ['interpolate', ['linear'], ['zoom'], 5.8, 'hsla(0,0%,85%,0.53)', 6, '#fff'],
    },
  },
  { id: 'highway_minor', type: 'line', paint: { 'line-color': 'hsl(0,0%,88%)' } },
  {
    id: 'label_city',
    type: 'symbol',
    paint: { 'text-color': '#000', 'text-halo-color': '#fff', 'text-halo-width': 1 },
  },
  { id: 'water_name', type: 'symbol', paint: { 'text-color': '#495e91' } },
];

const changes = darkBasemap(POSITRON);
const darkOf = (layer: string, property: string) =>
  changes.find((change) => change.layer === layer && change.property === property)?.dark;

describe('parseColor', () => {
  it.each([
    ['#fff', 1, 1],
    ['#1b2230', 0.147, 1],
    ['rgb(242,243,240)', 0.947, 1],
    ['rgba(255, 255, 255, 0.7)', 1, 0.7],
    ['hsl(0,0%,98%)', 0.98, 1],
    ['hsla(0,0%,85%,0.69)', 0.85, 0.69],
  ])('%s', (text, l, a) => {
    const color = parseColor(text)!;
    expect(color.l).toBeCloseTo(l, 2);
    expect(color.a).toBeCloseTo(a, 3);
  });

  it('leaves expression words alone', () => {
    expect(parseColor('interpolate')).toBeNull();
    expect(parseColor('zoom')).toBeNull();
  });
});

describe('darkBasemap', () => {
  it('puts the land on the scene ground', () => {
    expect(lightnessOf(darkOf('background', 'background-color'))).toBeCloseTo(0.098, 2);
  });

  it('draws roads and buildings lighter than land, and water darker', () => {
    const land = lightnessOf(darkOf('background', 'background-color'));
    expect(lightnessOf(darkOf('highway_major_inner', 'line-color'))).toBeGreaterThan(land + 0.03);
    expect(lightnessOf(darkOf('highway_minor', 'line-color'))).toBeGreaterThan(land + 0.03);
    expect(lightnessOf(darkOf('building', 'fill-color'))).toBeGreaterThan(land + 0.02);
    expect(lightnessOf(darkOf('water', 'fill-color'))).toBeLessThan(land);
  });

  it('turns dark text light, halos to the ground, and keeps a label hue', () => {
    expect(lightnessOf(darkOf('label_city', 'text-color'))).toBeGreaterThan(0.8);
    expect(lightnessOf(darkOf('label_city', 'text-halo-color'))).toBeLessThan(0.12);
    const waterName = parseColor(darkOf('water_name', 'text-color') as string)!;
    expect(waterName.h).toBeCloseTo(parseColor('#495e91')!.h, 0);
    expect(waterName.l).toBeGreaterThan(0.55);
  });

  it('recolors inside expressions and keeps alpha', () => {
    const motorway = darkOf('highway_motorway_inner', 'line-color') as unknown[];
    expect(motorway.slice(0, 3)).toEqual(['interpolate', ['linear'], ['zoom']]);
    expect(parseColor(motorway[4] as string)!.a).toBeCloseTo(0.53, 2);
    expect(lightnessOf(motorway[4])).toBeLessThan(0.2);
  });

  it('touches only colors, and records the light value to switch back', () => {
    expect(changes.some((change) => change.property === 'line-width')).toBe(false);
    expect(changes.some((change) => change.property === 'fill-antialias')).toBe(false);
    expect(changes.find((change) => change.layer === 'water')?.light).toBe('rgb(194, 200, 202)');
  });

  it('stays dark for any light input', () => {
    for (const l of [0.7, 0.8, 0.9, 1])
      expect(darkFill({ h: 0, s: 0, l, a: 1 }).l).toBeLessThanOrEqual(0.26);
  });
});
