import { describe, expect, it } from 'vitest';
import { createBlockIndex, permitStreet, type DcBlock } from './blocks';

describe('DC block matching', () => {
  it('reads the street out of a permit location', () => {
    expect(permitStreet('800 - 899 BLOCK OF F STREET NW')).toBe('F STREET NW');
    expect(permitStreet('701 HOWARD ROAD SE')).toBe('HOWARD ROAD SE');
    expect(permitStreet('1301-A  12TH STREET NE')).toBe('12TH STREET NE');
    expect(permitStreet(null)).toBeNull();
  });

  // F St NW runs east-west at about 38.8975; 8th St NW crosses it at -77.0230.
  const fStreet: DcBlock = {
    key: 'f-800',
    street: 'F ST NW',
    path: [
      [-77.0228, 38.8975],
      [-77.0217, 38.8975],
    ],
  };
  const eighth: DcBlock = {
    key: '8th-600',
    street: '8TH ST NW',
    path: [
      [-77.023, 38.8977],
      [-77.023, 38.899],
    ],
  };
  const nearest = createBlockIndex([fStreet, eighth]);

  it('takes the nearest block on the street the permit names', () => {
    // 15 m north of F St's middle, a few meters from 8th St: the name decides.
    expect(nearest([-77.0225, 38.89764], 'F STREET NW')?.key).toBe('f-800');
    expect(nearest([-77.02305, 38.8985], '8TH STREET NW')?.key).toBe('8th-600');
  });

  it('falls back to a block the point is on, and gives up beyond reach', () => {
    expect(nearest([-77.0222, 38.89752], 'SOMEWHERE ELSE')?.key).toBe('f-800');
    expect(nearest([-77.0222, 38.899], 'F STREET NW')).toBeNull();
  });
});
