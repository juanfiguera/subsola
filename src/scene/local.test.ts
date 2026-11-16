import { describe, expect, it } from 'vitest';
import {
  createFrame,
  densify,
  distance2,
  midpoint,
  nearestFraction,
  offsetPolyline,
  straighten,
  type Vec2,
} from './local';
import { distanceMeters } from '../geo';

describe('createFrame', () => {
  const frame = createFrame([-73.91477, 40.766532]);

  it('puts the origin at 0,0 and round-trips', () => {
    expect(frame.toLocal([-73.91477, 40.766532])).toEqual([0, 0]);
    const back = frame.toLngLat(frame.toLocal([-73.9135, 40.7672]));
    expect(back[0]).toBeCloseTo(-73.9135, 9);
    expect(back[1]).toBeCloseTo(40.7672, 9);
  });

  it('matches geodesic distance at block scale', () => {
    const point = [-73.9135, 40.7672];
    const local = frame.toLocal(point);
    const geodesic = distanceMeters([-73.91477, 40.766532], { type: 'Point', coordinates: point });
    expect(Math.hypot(...local)).toBeCloseTo(geodesic, 1);
  });
});

describe('polyline helpers', () => {
  const line: [number, number][] = [
    [0, 0],
    [10, 0],
  ];

  it('offsets to the right of travel direction', () => {
    expect(offsetPolyline(line, 2)).toEqual([
      [0, -2],
      [10, -2],
    ]);
  });

  it('densifies without exceeding the step', () => {
    const dense = densify(line, 2);
    expect(dense).toHaveLength(6);
    dense.slice(1).forEach((p, i) => expect(distance2(p, dense[i]!)).toBeLessThanOrEqual(2));
  });

  it('finds the midpoint by length', () => {
    expect(
      midpoint([
        [0, 0],
        [10, 0],
        [10, 10],
      ]),
    ).toEqual([10, 0]);
  });
});

describe('nearestFraction', () => {
  const line: Vec2[] = [
    [0, 0],
    [10, 0],
    [10, 10],
  ];

  it('finds the closest point along a bent line', () => {
    expect(nearestFraction(line, [5, 3])).toBeCloseTo(0.25);
    expect(nearestFraction(line, [14, 5])).toBeCloseTo(0.75);
  });

  it('clamps to the ends', () => {
    expect(nearestFraction(line, [-5, 0])).toBe(0);
    expect(nearestFraction(line, [10, 40])).toBe(1);
  });
});

describe('straighten', () => {
  it('drops points along a straight block, the way DC files its streets', () => {
    const line: Vec2[] = [
      [0, 0],
      [12, 0.05],
      [25, -0.1],
      [40, 0.08],
      [60, 0],
    ];
    expect(straighten(line, 0.3)).toEqual([
      [0, 0],
      [60, 0],
    ]);
  });

  it('keeps a real bend', () => {
    const line: Vec2[] = [
      [0, 0],
      [20, 0.1],
      [40, 0],
      [40, 30],
    ];
    expect(straighten(line, 0.3)).toEqual([
      [0, 0],
      [40, 0],
      [40, 30],
    ]);
  });
});
