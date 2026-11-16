import { afterEach, describe, expect, it, vi } from 'vitest';
import { geocodeSd, reverseGeocodeSd, sdQuery } from './sdGeocode';

const respond = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const candidate = (StAddr: string, score = 100, Addr_type = 'StreetAddress') => ({
  score,
  location: { x: -117.16387, y: 32.71572 },
  attributes: { StAddr, Addr_type },
});

describe('geocodeSd', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('leaves out the city name, which the locator scores against', async () => {
    expect(sdQuery('100 W Broadway, San Diego, CA 92101')).toBe('100 W Broadway 92101');
    expect(sdQuery('100 W Broadway, San Diego')).toBe('100 W Broadway');
    const fetch = vi.fn().mockResolvedValue(respond({ candidates: [candidate('100 W BROADWAY')] }));
    vi.stubGlobal('fetch', fetch);
    const address = await geocodeSd('100 W Broadway, San Diego');
    expect(new URL(String(fetch.mock.calls[0]![0])).searchParams.get('SingleLine')).toBe(
      '100 W Broadway',
    );
    expect(address.label).toBe('100 W Broadway, San Diego, CA');
    expect(address.street).toBe('W BROADWAY');
  });

  it('turns down a weak match or a street with no house number', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          respond({
            candidates: [candidate('1 MAIN ST', 64), candidate('W BROADWAY', 95, 'StreetName')],
          }),
        ),
      ),
    );
    await expect(geocodeSd('1 Main St')).rejects.toThrow('No City of San Diego address');
  });

  it('names the nearest address to a spot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond({
          address: { Address: '975 BROADWAY CR' },
          location: { x: -117.1629, y: 32.7155 },
        }),
      ),
    );
    expect((await reverseGeocodeSd([-117.163, 32.7155])).label).toBe(
      '975 Broadway Cr, San Diego, CA',
    );
  });
});
