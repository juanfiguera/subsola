import { describe, expect, it } from 'vitest';
import { SET_BACK_M, frontageLotLine, lotLineNote, streetOfAddress } from './frontage';
import type { Vec2 } from './scene/local';

/**
 * Shaped like 1437 Bannock St, Denver: the address point on the City and County Building, about
 * 108 m from Bannock St (the street it's numbered on) and closer to Cherokee St behind it.
 */
const bannock = {
  label: 'N BANNOCK ST',
  paths: [
    [
      [-108, -200],
      [-108, 200],
    ] as Vec2[],
  ],
};
const cherokee = {
  label: 'N CHEROKEE ST',
  paths: [
    [
      [60, -200],
      [60, 200],
    ] as Vec2[],
  ],
};
// The building runs from 20 m short of Bannock to 20 m short of Cherokee.
const building: Vec2[] = [
  [-88, -40],
  [40, -40],
  [40, 40],
  [-88, 40],
  [-88, -40],
];

describe('streetOfAddress', () => {
  it('drops the house number', () => {
    expect(streetOfAddress('1437 Bannock St')).toBe('Bannock St');
    expect(streetOfAddress('25-87 37 STREET')).toBe('37 STREET');
    expect(streetOfAddress('City and County Building')).toBeNull();
  });
});

describe('frontageLotLine', () => {
  it("measures from the building's face on its named street, not the nearer one behind", () => {
    const line = frontageLotLine('1437 Bannock St', [bannock, cherokee], [building]);
    expect(line?.from).toBe('building');
    expect(line?.street).toBe('N BANNOCK ST');
    expect(line?.point[0]).toBeCloseTo(-88);
  });

  it('takes the nearest building when the point falls just outside one', () => {
    const shifted = building.map(([x, y]): Vec2 => [x, y + 45]);
    const line = frontageLotLine('1437 Bannock St', [bannock], [shifted]);
    expect(line?.from).toBe('building');
    expect(line?.point[0]).toBeCloseTo(-88);
  });

  it('falls back to half a street in from the center line without a building', () => {
    const line = frontageLotLine('1437 Bannock St', [bannock], []);
    expect(line?.from).toBe('street');
    expect(line?.point[0]).toBeCloseTo(-96);
    expect(line?.point[1]).toBeCloseTo(0);
  });

  it('leaves an address close to its street alone', () => {
    const near = {
      label: 'N BANNOCK ST',
      paths: [
        [
          [-(SET_BACK_M - 5), -200],
          [-(SET_BACK_M - 5), 200],
        ] as Vec2[],
      ],
    };
    expect(frontageLotLine('1437 Bannock St', [near], [building])).toBeNull();
  });

  it('gives up when its street is not loaded', () => {
    expect(frontageLotLine('1437 Bannock St', [cherokee], [building])).toBeNull();
  });

  it('measures from where the address is, which needn’t be the frame’s origin', () => {
    const line = frontageLotLine('1437 Bannock St', [bannock], [], [0, 100]);
    expect(line?.point).toEqual([-96, 100]);
  });
});

describe('lotLineNote', () => {
  it('says how the lot line was placed when it was not a service line', () => {
    expect(lotLineNote({ point: [0, 0], from: 'building', street: 'N BANNOCK ST' })).toBe(
      'The address point sits well back from N Bannock St, so distances are measured from the front of the building on that street.',
    );
    expect(lotLineNote({ point: [0, 0], from: 'service' })).toBeNull();
    expect(lotLineNote({ point: [0, 0], from: 'address' })).toBeNull();
  });
});
