import { describe, expect, it } from 'vitest';
import { PIPE_RADIUS_M, detailForZoom, fittingsOf, type Joint } from './tubes';
import type { Vec2 } from './local';

const joint = (position: Vec2, neighbors: Vec2[]): Joint => ({
  ref: 'run',
  utility: 'water',
  position,
  depthFt: 4,
  neighbors,
});

describe('fittingsOf', () => {
  const reach = PIPE_RADIUS_M.water * 0.9;
  const radius = PIPE_RADIUS_M.water * 1.16;

  it('caps a run end with one sleeve along the pipe', () => {
    const sleeves = fittingsOf([joint([0, 0], [[10, 0]])]);
    expect(sleeves).toHaveLength(1);
    expect(sleeves[0]!.b[0]).toBeCloseTo(reach);
    expect(sleeves[0]!.a[0]).toBeCloseTo(-reach * 0.15);
    expect(sleeves[0]!.b[1]).toBeCloseTo(0);
  });

  it('joins a straight run with a coupling that stops at the joint', () => {
    const sleeves = fittingsOf([
      joint(
        [0, 0],
        [
          [-10, 0],
          [10, 0.5],
        ],
      ),
    ]);
    expect(sleeves).toHaveLength(2);
    for (const sleeve of sleeves) expect(sleeve.a).toEqual([0, 0]);
  });

  it('turns a square corner with hubs that cross to cover its outside', () => {
    const [west, north] = fittingsOf([
      joint(
        [0, 0],
        [
          [-10, 0],
          [0, 10],
        ],
      ),
    ]);
    // Each hub reaches one fitting radius back past the joint, filling the corner square.
    expect(west!.a[0]).toBeCloseTo(radius);
    expect(north!.a[1]).toBeCloseTo(-radius);
  });

  it('reaches back less on a gentle bend', () => {
    const [first] = fittingsOf([
      joint(
        [0, 0],
        [
          [-10, 0],
          [10, 4],
        ],
      ),
    ]);
    expect(first!.a[0]).toBeGreaterThan(0);
    expect(first!.a[0]).toBeLessThan(radius * 0.3);
  });

  it('keeps sleeves on a short segment from meeting in the middle', () => {
    const sleeves = fittingsOf([joint([0, 0], [[0.4, 0]])]);
    expect(sleeves[0]!.b[0]).toBeCloseTo(0.2);
  });
});

describe('detailForZoom', () => {
  it('draws fewer sides the further out the camera is', () => {
    expect(detailForZoom(1)).toBe('low');
    expect(detailForZoom(3.5)).toBe('medium');
    expect(detailForZoom(6)).toBe('high');
  });

  it('keeps the widest pipe within half a pixel of round at each level', () => {
    const sewerRadiusPx = (zoom: number) => PIPE_RADIUS_M.sewer * 2 ** zoom;
    const error = (sides: number, radiusPx: number) => radiusPx * (1 - Math.cos(Math.PI / sides));
    expect(error(6, sewerRadiusPx(2.5))).toBeLessThan(0.5);
    expect(error(12, sewerRadiusPx(4.5))).toBeLessThan(0.5);
  });
});
