import { describe, expect, it } from 'vitest';
import { clipToSection, crossesSection, crossingOf, inSection, type Section } from './section';

// Looking north: the slice keeps a band 10 m either side of y = 0.
const section: Section = { center: [0, 0], depth: [0, 1], halfWidth: 10 };

describe('section', () => {
  it('keeps points inside the band and drops ones behind or in front', () => {
    expect(inSection([500, 4], section)).toBe(true);
    expect(inSection([0, 30], section)).toBe(false);
    expect(inSection([0, -30], section)).toBe(false);
  });

  it('keeps a line that runs through the band even with no vertex in it', () => {
    expect(
      crossesSection(
        [
          [0, -50],
          [0, 50],
        ],
        section,
      ),
    ).toBe(true);
  });

  it('drops a parallel street one block over', () => {
    expect(
      crossesSection(
        [
          [-100, 80],
          [100, 80],
        ],
        section,
      ),
    ).toBe(false);
  });

  it('finds where a pipe heading into the screen passes through the cut', () => {
    expect(
      crossingOf(
        [
          [5, -40],
          [5, 60],
        ],
        section,
      ),
    ).toEqual([5, 0]);
  });

  it('has no crossing point for a pipe running across the view', () => {
    expect(
      crossingOf(
        [
          [-100, 2],
          [100, 3],
        ],
        section,
      ),
    ).toBeNull();
  });

  it('cuts a cross street down to the slice', () => {
    const crossStreet: [number, number][] = [
      [-5, -100],
      [5, -100],
      [5, 100],
      [-5, 100],
    ];
    const clipped = clipToSection(crossStreet, section);
    expect(Math.min(...clipped.map(([, y]) => y))).toBeCloseTo(-10);
    expect(Math.max(...clipped.map(([, y]) => y))).toBeCloseTo(10);
    expect(clipped).toHaveLength(4);
  });
});
