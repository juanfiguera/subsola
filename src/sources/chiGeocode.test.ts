import { afterEach, describe, expect, it, vi } from 'vitest';
import { chiAddressParts, chiAddressWhere, geocodeChi, reverseGeocodeChi } from './chiGeocode';

const respond = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const point = (
  number: string,
  direction: string | null,
  name: string,
  type: string | null,
  { x = -87.656, y = 41.947, unit = '' } = {},
) => ({
  addrnocom: number,
  lst_predir: direction,
  st_name: name,
  lst_type: type,
  ...(unit ? { subaddcom: unit } : {}),
  the_geom: { type: 'Point', coordinates: [x, y] },
});

describe('chiAddressParts', () => {
  it('splits a typed address the way the county files it', () => {
    expect(chiAddressParts('1060 W Addison St, Chicago, IL 60613')).toEqual({
      number: 1060,
      direction: 'W',
      name: 'ADDISON',
      type: 'ST',
    });
    expect(chiAddressParts('233 South Wacker Drive')).toEqual({
      number: 233,
      direction: 'S',
      name: 'WACKER',
      type: 'DR',
    });
    expect(chiAddressParts('1400 E 63 St')?.name).toBe('63RD');
    expect(chiAddressParts('100 W 111th St')?.name).toBe('111TH');
    expect(chiAddressParts('1300 N Lake Shore Dr')?.name).toBe('LAKE SHORE');
    expect(chiAddressParts('3000 Broadway')).toEqual({
      number: 3000,
      direction: null,
      name: 'BROADWAY',
      type: null,
    });
  });

  it("knows Dr. King's street by its short names", () => {
    expect(chiAddressParts('4500 S Martin Luther King Dr')?.name).toBe(
      'DOCTOR MARTIN LUTHER KING JR',
    );
    expect(chiAddressParts('4500 S MLK Dr')?.name).toBe('DOCTOR MARTIN LUTHER KING JR');
    expect(chiAddressParts('4500 S King Dr')?.name).toBe('DOCTOR MARTIN LUTHER KING JR');
  });

  it('keeps a quote or anything else odd out of the query', () => {
    const parts = chiAddressParts("12 W O'Brien St")!;
    expect(parts.name).toBe('O BRIEN');
    expect(chiAddressWhere(parts)).not.toContain("'O'");
    expect(chiAddressParts('Addison St')).toBeNull();
  });

  it('asks for exactly the parts typed, in Chicago', () => {
    expect(chiAddressWhere(chiAddressParts('1060 W Addison St')!)).toBe(
      "addrnocom = '1060' AND st_name = 'ADDISON' AND geocode_muni = 'CHICAGO' AND lst_predir = 'W' AND lst_type = 'ST'",
    );
  });
});

describe('geocodeChi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("names an address the way it's written, and prefers the building to its units", async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          respond([
            point('1060', 'W', 'ADDISON', 'ST', { unit: 'UNIT 2' }),
            point('1060', 'W', 'ADDISON', 'ST'),
          ]),
        ),
    );
    const address = await geocodeChi('1060 W Addison St');
    expect(address.label).toBe('1060 W Addison St, Chicago, IL');
    expect(address.street).toBe('W ADDISON ST');
    expect(address.borough).toBe('CHICAGO');
  });

  it("gives Dr. King's street the centerline's spelling", async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(respond([point('4500', 'S', 'DOCTOR MARTIN LUTHER KING JR', 'DR')])),
    );
    expect((await geocodeChi('4500 S King Dr')).street).toBe('S DR MARTIN LUTHER KING JR DR');
  });

  it('says so when the county has no such address', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond([])));
    await expect(geocodeChi('1 Main St')).rejects.toThrow('No Chicago address');
  });

  it('names the nearest address to a spot', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          respond([
            point('1033', 'W', 'ADDISON', 'ST', { x: -87.6558, y: 41.9471 }),
            point('1020', 'W', 'ADDISON', 'ST', { x: -87.6556, y: 41.9475 }),
          ]),
        ),
    );
    expect((await reverseGeocodeChi([-87.6555, 41.9475])).label).toBe(
      '1020 W Addison St, Chicago, IL',
    );
  });
});
