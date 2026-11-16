import { afterEach, describe, expect, it, vi } from 'vitest';
import { denAddressParts, denAddressWhere, geocodeDen, reverseGeocodeDen } from './denGeocode';

const respond = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const point = (
  number: number,
  direction: string | null,
  name: string,
  type: string | null,
  { x = -104.99, y = 39.74, unit = '', building = '' } = {},
) => ({
  attributes: {
    ADDRESS_NUMBER: number,
    PREDIRECTIONAL: direction,
    STREET_NAME: name,
    POSTTYPE: type,
    BUILDING_TYPE: building,
    UNIT_TYPE: unit,
  },
  geometry: { x, y },
});

describe('denAddressParts', () => {
  it('splits a typed address the way the city files it', () => {
    expect(denAddressParts('1437 Bannock St, Denver, CO 80202')).toEqual({
      number: 1437,
      direction: null,
      name: 'BANNOCK',
      type: 'ST',
    });
    expect(denAddressParts('1500 East Colfax Avenue')).toEqual({
      number: 1500,
      direction: 'E',
      name: 'COLFAX',
      type: 'AVE',
    });
    expect(denAddressParts('1600 Broadway')?.name).toBe('BROADWAY');
    expect(denAddressParts('2000 E 17 Ave')?.name).toBe('17TH');
    expect(denAddressParts('100 W 1st Ave')?.name).toBe('1ST');
    expect(denAddressParts('100 W 11 Ave')?.name).toBe('11TH');
  });

  it('keeps a quote or anything else odd out of the query', () => {
    const parts = denAddressParts("12 O'Brien St")!;
    expect(parts.name).toBe('O BRIEN');
    expect(denAddressWhere(parts)).not.toContain("'O'");
    expect(denAddressParts('Bannock St')).toBeNull();
  });

  it('asks for exactly the parts typed', () => {
    expect(denAddressWhere(denAddressParts('1500 E Colfax Ave')!)).toBe(
      "ADDRESS_NUMBER = 1500 AND UPPER(STREET_NAME) = 'COLFAX' AND PREDIRECTIONAL = 'E' AND UPPER(POSTTYPE) = 'AVE'",
    );
  });
});

describe('geocodeDen', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("names an address the way it's said, and prefers the building to its units", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond({
          features: [
            point(1437, 'N', 'Bannock', 'St', { unit: 'Rm' }),
            point(1437, 'N', 'Bannock', 'St'),
          ],
        }),
      ),
    );
    const address = await geocodeDen('1437 Bannock St');
    expect(address.label).toBe('1437 Bannock St, Denver, CO');
    expect(address.street).toBe('N BANNOCK ST');
  });

  it('takes the north side of a street when no direction is typed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond({
          features: [point(1600, 'S', 'Broadway', null), point(1600, 'N', 'Broadway', null)],
        }),
      ),
    );
    expect((await geocodeDen('1600 Broadway')).label).toBe('1600 Broadway, Denver, CO');
  });

  it('says so when the city has no such address', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond({ features: [] })));
    await expect(geocodeDen('1 Main St')).rejects.toThrow('No Denver address');
  });

  it('names the nearest address to a spot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond({
          features: [
            point(1500, 'E', 'Colfax', 'Ave', { x: -104.9862, y: 39.7402 }),
            point(1510, 'E', 'Colfax', 'Ave', { x: -104.9859, y: 39.7401 }),
          ],
        }),
      ),
    );
    expect((await reverseGeocodeDen([-104.9858, 39.7401])).label).toBe(
      '1510 E Colfax Ave, Denver, CO',
    );
  });
});
