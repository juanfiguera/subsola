import { afterEach, describe, expect, it, vi } from 'vitest';
import { geocodeSea, reverseGeocodeSea } from './seaGeocode';

const respond = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const candidate = (StAddr: string, City: string, score = 100) => ({
  score,
  location: { x: -122.3305, y: 47.604 },
  attributes: { StAddr, City },
});

describe('geocodeSea', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps to Seattle, passing over a better-scored match elsewhere in the county', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond({
          candidates: [
            candidate('600 4TH ST', 'Kirkland'),
            candidate('600 4TH AVE', 'Seattle', 98),
          ],
        }),
      ),
    );
    const address = await geocodeSea('600 4th Ave');
    expect(address.label).toBe('600 4th Ave, Seattle, WA');
    expect(address.street).toBe('4TH AVE');
  });

  it('turns down a weak match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respond({ candidates: [candidate('MAIN ST', 'Seattle', 70)] })),
    );
    await expect(geocodeSea('1 Main St')).rejects.toThrow('No Seattle address');
  });

  it('names the nearest Seattle address to a spot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond({
          address: { Address: '601 5TH AVE', City: 'Seattle' },
          location: { x: -122.3297, y: 47.6038 },
        }),
      ),
    );
    expect((await reverseGeocodeSea([-122.3299, 47.6036])).label).toBe('601 5th Ave, Seattle, WA');
  });
});
