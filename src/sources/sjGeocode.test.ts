import { afterEach, describe, expect, it, vi } from 'vitest';
import { geocodeSj, reverseGeocodeSj, sjAddressParts, sjAddressWhere } from './sjGeocode';

const respond = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const point = (
  number: number,
  direction: string | null,
  name: string,
  type: string | null,
  { x = -121.8859, y = 37.3375, prefix = null as string | null, status = 'Active' } = {},
) => ({
  attributes: {
    Add_Number: number,
    St_PreDirAbbr: direction,
    St_PreTyp: prefix,
    StreetName: name,
    St_PosTypUSPS: type,
    St_PosDir: null,
    Status: status,
  },
  geometry: { x, y },
});

describe('sjAddressParts', () => {
  it('splits a typed address the way the city files it', () => {
    expect(sjAddressParts('200 E Santa Clara St, San Jose, CA 95113')).toEqual({
      number: 200,
      direction: 'E',
      name: 'SANTA CLARA',
      type: 'ST',
    });
    expect(sjAddressParts('1150 The Alameda')).toEqual({
      number: 1150,
      direction: null,
      name: 'THE ALAMEDA',
      type: null,
    });
    expect(sjAddressParts('100 North First Street')?.name).toBe('1ST');
    expect(sjAddressParts('20 S 2 St')?.name).toBe('2ND');
    expect(sjAddressParts('5000 Almaden Expressway')?.type).toBe('EXPY');
  });

  it('keeps a quote or anything else odd out of the query', () => {
    const parts = sjAddressParts("12 O'Brien Ct")!;
    expect(parts.name).toBe('O BRIEN');
    expect(sjAddressWhere(parts)).not.toContain("'O'");
    expect(sjAddressParts('Santa Clara St')).toBeNull();
  });

  it('asks for the number and the name in the full street name', () => {
    expect(sjAddressWhere(sjAddressParts('200 E Santa Clara St')!)).toBe(
      "Add_Number = 200 AND UPPER(FullName) LIKE '%SANTA CLARA%'",
    );
  });
});

describe('geocodeSj', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('takes the point whose street agrees best, never the parcel or account fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      respond({
        features: [
          point(200, 'W', 'Santa Clara', 'St', { x: -121.9 }),
          point(200, 'E', 'Santa Clara', 'St'),
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const found = await geocodeSj('200 E Santa Clara St, San Jose, CA');
    expect(found).toMatchObject({
      label: '200 E Santa Clara St, San Jose, CA',
      lngLat: [-121.8859, 37.3375],
      street: 'E SANTA CLARA ST',
      borough: 'SAN JOSE',
    });
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.host).toBe('geo.sanjoseca.gov');
    const fields = url.searchParams.get('outFields')!.split(',');
    for (const field of ['ParcelID', 'APN', 'RSN', 'Client_ID', 'Notes', 'FullMailing'])
      expect(fields).not.toContain(field);
  });

  it("doesn't take 21st for 1st, and writes the ordinal the way people do", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond({
          features: [point(100, 'N', '21st', 'St', { x: -121.87 }), point(100, 'N', '1st', 'St')],
        }),
      ),
    );
    const found = await geocodeSj('100 N 1st St');
    expect(found.label).toBe('100 N 1st St, San Jose, CA');
    expect(found.lngLat[0]).toBe(-121.8859);
  });

  it('matches a street filed with a prefix type, and prefers an active address', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond({
          features: [
            point(10, null, 'Abetos', null, { prefix: 'Avenida', status: 'Retired', x: -121.8 }),
            point(10, null, 'Abetos', null, { prefix: 'Avenida' }),
          ],
        }),
      ),
    );
    const found = await geocodeSj('10 Avenida Abetos');
    expect(found.street).toBe('AVENIDA ABETOS');
    expect(found.lngLat[0]).toBe(-121.8859);
  });

  it('says so when nothing matches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respond({ features: [point(100, 'N', '21st', 'St')] })),
    );
    await expect(geocodeSj('100 N 1st St')).rejects.toThrow('No San Jose address');
  });
});

describe('reverseGeocodeSj', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('takes the nearest active address', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond({
          features: [
            point(300, 'E', 'Santa Clara', 'St', { x: -121.884, y: 37.338 }),
            point(200, 'E', 'Santa Clara', 'St'),
          ],
        }),
      ),
    );
    expect((await reverseGeocodeSj([-121.8858, 37.3376])).label).toBe(
      '200 E Santa Clara St, San Jose, CA',
    );
  });
});
