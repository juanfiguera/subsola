import { afterEach, describe, expect, it, vi } from 'vitest';
import { geocodeLa } from './laGeocode';

const respond = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const candidate = (City: string, StAddr: string, Addr_type = 'PointAddress', score = 100) => ({
  score,
  location: { x: -118.2432, y: 34.0541 },
  attributes: { City, StAddr, Addr_type },
});

describe('geocodeLa', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('takes the address point in the City of Los Angeles', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond({
          candidates: [
            candidate('LOS ANGELES CA', '200 N SPRING ST', 'Parcel'),
            candidate('Los Angeles', '200 North Spring Street'),
          ],
        }),
      ),
    );
    const address = await geocodeLa('200 N Spring St');
    expect(address.label).toBe('200 North Spring Street, Los Angeles, CA');
    expect(address.street).toBe('NORTH SPRING STREET');
  });

  it('turns down an address in another city of the county', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(respond({ candidates: [candidate('Alhambra', '1 East Main Street')] })),
    );
    await expect(geocodeLa('1 Main St')).rejects.toThrow('No City of Los Angeles address');
  });
});
