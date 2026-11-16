import { describe, expect, it } from 'vitest';
import {
  createLidIndex,
  laStormDrainMaterial,
  laStormDrainOwner,
  laStormDrainSizeIn,
} from './drains';

describe('laStormDrainMaterial', () => {
  it("reads the layer's words without the abbreviations", () => {
    expect(laStormDrainMaterial('Reinforced Concrete Pipe (R.C.P.)')).toBe('Reinforced concrete');
    expect(laStormDrainMaterial('Reinforced Concrete Box (R.C.B.)')).toBe(
      'Reinforced concrete box',
    );
    expect(laStormDrainMaterial('Concrete Pipe')).toBe('Concrete');
    expect(laStormDrainMaterial('Polyvinyl Chloride (P.V.C.)')).toBe('PVC');
    expect(laStormDrainMaterial('Brick')).toBe('Brick');
  });

  it('leaves unknown and other blank', () => {
    expect(laStormDrainMaterial('Unknown')).toBeNull();
    expect(laStormDrainMaterial('Other')).toBeNull();
    expect(laStormDrainMaterial(null)).toBeNull();
  });
});

describe('laStormDrainSizeIn', () => {
  it('takes the height in inches', () => {
    expect(laStormDrainSizeIn(18, 'Round')).toBe(18);
    expect(laStormDrainSizeIn(8, null)).toBe(8);
    expect(laStormDrainSizeIn(96, 'Square or Rectangular')).toBe(96);
  });

  it('leaves out a box height entered in feet, and sizes too big to draw', () => {
    expect(laStormDrainSizeIn(6, 'Square or Rectangular')).toBeNull();
    expect(laStormDrainSizeIn(192, 'Square or Rectangular')).toBeNull();
    expect(laStormDrainSizeIn(0, 'Round')).toBeNull();
  });
});

describe('laStormDrainOwner', () => {
  it("names other owners, and no one for the city's own or other", () => {
    expect(laStormDrainOwner('County of Los Angeles')).toBe('Los Angeles County');
    expect(laStormDrainOwner('City of Los Angeles')).toBeNull();
    expect(laStormDrainOwner('Other')).toBeNull();
  });
});

describe('createLidIndex', () => {
  it('finds the nearest lid within reach, and none past it', () => {
    const lids = createLidIndex(10);
    lids.add([-118.25, 34.05], 300);
    // About 5 m and 8 m east.
    lids.add([-118.24995, 34.05], 301);
    lids.add([-118.24991, 34.05], 302);
    expect(lids.nearest([-118.24994, 34.05])).toBe(301);
    // About 20 m north of all of them.
    expect(lids.nearest([-118.25, 34.05018])).toBeUndefined();
  });
});
