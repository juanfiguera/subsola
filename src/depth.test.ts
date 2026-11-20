import { describe, expect, it } from 'vitest';
import {
  CHI_DEPTH_STANDARDS,
  DAL_DEPTH_STANDARDS,
  DC_DEPTH_STANDARDS,
  NYC_DEPTH_STANDARDS,
  depthStandards,
  useDepthStandards,
  MAX_DEPTH_FT,
  describeDepth,
  drawnDepthFt,
  formatFeet,
} from './depth';

describe('depth standards', () => {
  it.each([
    ...Object.entries(NYC_DEPTH_STANDARDS).map(
      ([utility, standard]) => [`NYC ${utility}`, standard] as const,
    ),
    ...Object.entries(DC_DEPTH_STANDARDS).map(
      ([utility, standard]) => [`DC ${utility}`, standard] as const,
    ),
    ...Object.entries(DAL_DEPTH_STANDARDS).map(
      ([utility, standard]) => [`Dallas ${utility}`, standard] as const,
    ),
  ])('%s is a sane range within the chart', (_, standard) => {
    expect(standard.shallowestFt).toBeGreaterThan(0);
    expect(standard.shallowestFt).toBeLessThan(standard.deepestFt);
    expect(standard.deepestFt).toBeLessThanOrEqual(MAX_DEPTH_FT);
  });

  // Basin leads run at the sewer's depth and cross under the water main to reach it.
  it.each([
    ['NYC', NYC_DEPTH_STANDARDS],
    ['DC', DC_DEPTH_STANDARDS],
    ['Dallas', DAL_DEPTH_STANDARDS],
  ] as const)('draws %s sewers clear below the water mains', (_, standards) => {
    expect(drawnDepthFt(standards.sewer!) - drawnDepthFt(standards.water!)).toBeGreaterThanOrEqual(
      1.5,
    );
  });

  it('cites a source for every depth that is not marked unknown', () => {
    for (const standard of [
      ...Object.values(NYC_DEPTH_STANDARDS),
      ...Object.values(DC_DEPTH_STANDARDS),
      ...Object.values(DAL_DEPTH_STANDARDS),
    ]) {
      if (standard.basis === 'unknown') expect(standard.source).toBeNull();
      else expect(standard.source?.url).toMatch(/^https:\/\//);
    }
  });
});

describe('Chicago water', () => {
  it("counts from the big feeders' 3 ft of cover but draws the grid mains near 5 ft", () => {
    const water = CHI_DEPTH_STANDARDS.water!;
    expect([water.shallowestFt, drawnDepthFt(water), water.deepestFt]).toEqual([3, 5, 6]);
    expect(water.summary).toContain('54 in and larger have only about 3 ft of cover');
    expect(water.source?.url).toContain('CDWM_WaterSection_Standard_Notes_Info.pdf');
  });
});

describe('Dallas water', () => {
  it("counts from DWU's 4 ft street minimum and cites its design manual", () => {
    const water = DAL_DEPTH_STANDARDS.water!;
    expect([water.shallowestFt, drawnDepthFt(water), water.deepestFt]).toEqual([4, 4, 7]);
    expect(water.source?.name).toContain('Table 2.5.2');
  });
});

describe('formatFeet', () => {
  it('reads like a tape measure', () => {
    expect(formatFeet(1.5)).toBe('1 ft 6 in');
    expect(formatFeet(3.4)).toBe('3 ft 5 in');
    expect(formatFeet(5)).toBe('5 ft');
    expect(formatFeet(0.5)).toBe('6 in');
  });

  it('says so when depth is not published', () => {
    expect(describeDepth(depthStandards().electric!)).toBe('Depth not published');
    expect(describeDepth(depthStandards().gas!)).toBe('1 ft 6 in down');
  });

  it('switches to the standards of the city on screen', () => {
    useDepthStandards(DC_DEPTH_STANDARDS);
    expect(describeDepth(depthStandards().water!)).toBe('4 ft down');
    useDepthStandards(NYC_DEPTH_STANDARDS);
    expect(describeDepth(depthStandards().water!)).toBe('3 ft 5 in down');
  });
});
