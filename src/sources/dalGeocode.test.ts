import { afterEach, describe, expect, it, vi } from 'vitest';
import { dalAddressParts, dalAddressWhere, geocodeDal, reverseGeocodeDal } from './dalGeocode';

const respond = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const point = (
  number: number,
  direction: string | null,
  name: string,
  type: string | null,
  { x = -96.7958, y = 32.7771 } = {},
) => ({
  attributes: {
    HOUSENUMBER: number,
    STREETPREDIRECTION: direction,
    NAME: name,
    STREETTYPE: type,
    STREETPOSTDIRECTION: null,
  },
  geometry: { x, y },
});

describe('dalAddressParts', () => {
  it('splits a typed address the way the city files it', () => {
    expect(dalAddressParts('1500 Marilla St, Dallas, TX 75201')).toEqual({
      number: 1500,
      direction: null,
      name: 'MARILLA',
      type: 'ST',
    });
    expect(dalAddressParts('4425 North Central Expressway')).toEqual({
      number: 4425,
      direction: 'N',
      name: 'CENTRAL',
      type: 'EXPY',
    });
    expect(dalAddressParts('100 2 Ave')?.name).toBe('2ND');
  });

  it("spells out Dr. King's boulevard the way the city does", () => {
    expect(dalAddressParts('2701 MLK Blvd')?.name).toBe('MARTIN LUTHER KING JR');
    expect(dalAddressParts('2701 Martin Luther King Jr Blvd')?.name).toBe('MARTIN LUTHER KING JR');
  });

  it('keeps a quote or anything else odd out of the query', () => {
    const parts = dalAddressParts("12 O'Connor St")!;
    expect(parts.name).toBe('O CONNOR');
    expect(dalAddressWhere(parts)).not.toContain("'O'");
    expect(dalAddressParts('Marilla St')).toBeNull();
  });

  it('asks for exactly the parts typed', () => {
    expect(dalAddressWhere(dalAddressParts('4425 N Central Expy')!)).toBe(
      "HOUSENUMBER = 4425 AND UPPER(NAME) = 'CENTRAL' AND STREETPREDIRECTION = 'N' AND UPPER(STREETTYPE) = 'EXPY'",
    );
  });
});

describe('geocodeDal', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('names an address the way people write it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respond({ features: [point(1500, null, 'MARILLA', 'ST')] })),
    );
    const address = await geocodeDal('1500 Marilla St');
    expect(address.label).toBe('1500 Marilla St, Dallas, TX');
    expect(address.street).toBe('MARILLA ST');
    expect(address.borough).toBe('DALLAS');
  });

  it('takes the street with no direction when none is typed', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          respond({ features: [point(600, 'N', 'ERVAY', 'ST'), point(600, null, 'ERVAY', 'ST')] }),
        ),
    );
    expect((await geocodeDal('600 Ervay St')).street).toBe('ERVAY ST');
  });

  it('says so when the city has no such address', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond({ features: [] })));
    await expect(geocodeDal('1 Main St')).rejects.toThrow('No Dallas address');
  });

  it('names the nearest address to a spot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond({
          features: [
            point(1500, null, 'MARILLA', 'ST', { x: -96.7958, y: 32.7771 }),
            point(1520, null, 'MARILLA', 'ST', { x: -96.7949, y: 32.7768 }),
          ],
        }),
      ),
    );
    expect((await reverseGeocodeDal([-96.7948, 32.7768])).label).toBe(
      '1520 Marilla St, Dallas, TX',
    );
  });
});
