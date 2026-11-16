import { afterEach, describe, expect, it, vi } from 'vitest';
import { geocodeDc } from './dcGeocode';

const found = {
  candidates: [{ address: '800 F STREET NW', score: 100, location: { x: -77.023, y: 38.897 } }],
};

const respond = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status });

describe('geocodeDc', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('tries again when DC GIS is busy', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(503))
      .mockResolvedValueOnce(respond(200, found));
    vi.stubGlobal('fetch', fetch);
    const address = await geocodeDc('800 F St NW');
    expect(address.label).toBe('800 F Street NW, Washington, DC');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("doesn't retry a request DC GIS rejects", async () => {
    const fetch = vi.fn().mockResolvedValue(respond(400));
    vi.stubGlobal('fetch', fetch);
    await expect(geocodeDc('800 F St NW')).rejects.toThrow('returned 400');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
