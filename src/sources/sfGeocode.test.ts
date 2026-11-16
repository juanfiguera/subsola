import { afterEach, describe, expect, it, vi } from 'vitest';
import { geocodeSf, reverseGeocodeSf } from './sfGeocode';

const respond = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const candidate = (address: string, score = 100) => ({
  candidates: [{ address, score, location: { x: -122.4187, y: 37.7793 } }],
});

describe('geocodeSf', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('tidies the address it finds', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          respond(candidate('1 DR CARLTON B GOODLETT PL, San Francisco, California, 94102')),
        ),
    );
    const address = await geocodeSf('1 Dr Carlton B Goodlett Pl, San Francisco, CA');
    expect(address.label).toBe('1 Dr Carlton B Goodlett Pl, San Francisco, CA');
    expect(address.street).toBe('DR CARLTON B GOODLETT PL');
  });

  it('places a house EAS lacks along its street', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ candidates: [] }))
      .mockResolvedValueOnce(respond(candidate('2350 29TH AVE, 94116')));
    vi.stubGlobal('fetch', fetch);
    expect((await geocodeSf('2350 29th Ave')).label).toBe('2350 29th Ave, San Francisco, CA');
    expect(String(fetch.mock.calls[1]![0])).toContain('sfgis_stclines_locator');
  });

  it('turns down a weak match', async () => {
    // Both locators answer, and each response body can be read once.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(respond(candidate('MAIN ST', 70)))),
    );
    await expect(geocodeSf('99999 Nowhere Blvd')).rejects.toThrow('No San Francisco address');
  });

  it('names the address, not the landmark, near a point', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond({
          address: {
            Match_addr:
              'San Francisco City Hall, 1 DR CARLTON B GOODLETT PL, San Francisco, California, 94102',
          },
          location: { x: -122.4187, y: 37.7793 },
        }),
      ),
    );
    expect((await reverseGeocodeSf([-122.419, 37.779])).label).toBe(
      '1 Dr Carlton B Goodlett Pl, San Francisco, CA',
    );
  });
});
