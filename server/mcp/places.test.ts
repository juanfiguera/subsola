import { describe, expect, it } from 'vitest';
import { namesAnotherPlace } from './places';
import { CHI, DAL, DC, DEN, LA, NYC, SD, SEA } from '../../src/regions';

describe('namesAnotherPlace', () => {
  it('flags an address in another state that a city geocoder matched anyway', () => {
    expect(namesAnotherPlace('1 Main St, Boston, MA', NYC)).toBe(true);
    expect(namesAnotherPlace('1 Main St, Springfield, Illinois', NYC)).toBe(true);
    expect(namesAnotherPlace('100 Main St, Charleston, West Virginia', NYC)).toBe(true);
    expect(namesAnotherPlace('1 Main St 02108', NYC)).toBe(true);
  });

  it("passes addresses that name the city's own state or ZIP", () => {
    expect(namesAnotherPlace('33 Union Square West, New York, NY 10003', NYC)).toBe(false);
    expect(namesAnotherPlace('25-87 37th St, Queens, New York', NYC)).toBe(false);
    expect(namesAnotherPlace('1420 5th Ave, Seattle, WA 98101', SEA)).toBe(false);
    expect(namesAnotherPlace('200 N Spring St, Los Angeles, CA', LA)).toBe(false);
    expect(namesAnotherPlace('33 Union Square West', NYC)).toBe(false);
    expect(namesAnotherPlace('1437 Bannock St, Denver, CO 80202', DEN)).toBe(false);
    expect(namesAnotherPlace('1437 Bannock St, Denver, CO 80302', DEN)).toBe(true);
    expect(namesAnotherPlace('1060 W Addison St, Chicago, IL 60613', CHI)).toBe(false);
    expect(namesAnotherPlace('1060 W Addison St, Chicago, IL 62613', CHI)).toBe(true);
    expect(namesAnotherPlace('1500 Marilla St, Dallas, TX 75201', DAL)).toBe(false);
    expect(namesAnotherPlace('1500 Marilla St, Dallas, TX 77002', DAL)).toBe(true);
  });

  it('reads Washington as DC and LA or SD as the city, not another state', () => {
    expect(namesAnotherPlace('800 F St NW, Washington', DC)).toBe(false);
    expect(namesAnotherPlace('800 F St NW, Washington, DC 20004', DC)).toBe(false);
    expect(namesAnotherPlace('200 N Spring St, LA', LA)).toBe(false);
    expect(namesAnotherPlace('202 C St, SD', SD)).toBe(false);
  });
});
