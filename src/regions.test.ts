import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHI,
  DAL,
  DC,
  DEN,
  LA,
  NYC,
  SD,
  SEA,
  SF,
  SJ,
  geocodeAnywhere,
  lotName,
  regionAt,
} from './regions';

describe('regions', () => {
  afterEach(() => vi.restoreAllMocks());

  it('knows which city a point is in', () => {
    expect(regionAt([-73.99, 40.735])).toBe(NYC);
    expect(regionAt([-77.023, 38.897])).toBe(DC);
    expect(regionAt([-122.4187, 37.7793])).toBe(SF);
    expect(regionAt([-118.2432, 34.0541])).toBe(LA);
    expect(regionAt([-117.1639, 32.7157])).toBe(SD);
    expect(regionAt([-122.3305, 47.604])).toBe(SEA);
    expect(regionAt([-104.9903, 39.7392])).toBe(DEN);
    expect(regionAt([-87.63, 41.88])).toBe(CHI);
    expect(regionAt([-96.797, 32.776])).toBe(DAL);
    expect(regionAt([-121.8859, 37.3375])).toBe(SJ);
    expect(regionAt([-90.2, 38.63])).toBeNull();
  });

  const found = (lngLat: [number, number]) => ({
    label: 'x',
    lngLat,
    street: undefined,
    borough: 'x',
    bbl: undefined,
  });

  it('asks DC first for an address with a quadrant, and NYC first otherwise', async () => {
    const dc = vi.spyOn(DC, 'geocode').mockResolvedValue(found([-77.023, 38.897]));
    const nyc = vi.spyOn(NYC, 'geocode').mockResolvedValue(found([-73.99, 40.735]));
    expect((await geocodeAnywhere('800 F St NW')).region).toBe(DC);
    expect(nyc).not.toHaveBeenCalled();
    expect((await geocodeAnywhere('33 Union Square West')).region).toBe(NYC);
    expect(dc).toHaveBeenCalledTimes(1);
  });

  it("tries the other city when the first doesn't know the address", async () => {
    vi.spyOn(NYC, 'geocode').mockRejectedValue(new Error('No NYC address found'));
    vi.spyOn(DC, 'geocode').mockResolvedValue(found([-77.03, 38.91]));
    expect((await geocodeAnywhere('1500 Massachusetts Ave')).region).toBe(DC);
  });

  it("doesn't trust an answer outside the city that gave it", async () => {
    // NYC's geocoder matching something in another state isn't an NYC address.
    vi.spyOn(NYC, 'geocode').mockResolvedValue(found([-75.16, 39.95]));
    vi.spyOn(DC, 'geocode').mockRejectedValue(new Error('No DC address'));
    vi.spyOn(SF, 'geocode').mockRejectedValue(new Error('No SF address'));
    vi.spyOn(LA, 'geocode').mockRejectedValue(new Error('No LA address'));
    vi.spyOn(SD, 'geocode').mockRejectedValue(new Error('No SD address'));
    vi.spyOn(SEA, 'geocode').mockRejectedValue(new Error('No Seattle address'));
    vi.spyOn(DEN, 'geocode').mockRejectedValue(new Error('No Denver address'));
    vi.spyOn(CHI, 'geocode').mockRejectedValue(new Error('No Chicago address'));
    vi.spyOn(DAL, 'geocode').mockRejectedValue(new Error('No Dallas address'));
    vi.spyOn(SJ, 'geocode').mockRejectedValue(new Error('No San Jose address'));
    await expect(geocodeAnywhere('1 Main St')).rejects.toThrow(
      'New York City, Washington, DC, San Francisco, Los Angeles, San Diego, Seattle, Denver, Chicago, Dallas, or San Jose',
    );
  });

  it('asks San Francisco first for an address that names it', async () => {
    const nyc = vi.spyOn(NYC, 'geocode');
    vi.spyOn(SF, 'geocode').mockResolvedValue(found([-122.4187, 37.7793]));
    expect((await geocodeAnywhere('1 Dr Carlton B Goodlett Pl, San Francisco')).region).toBe(SF);
    expect(nyc).not.toHaveBeenCalled();
  });

  it('asks Denver first for an address that names it, and names no lot', async () => {
    const nyc = vi.spyOn(NYC, 'geocode');
    vi.spyOn(DEN, 'geocode').mockResolvedValue(found([-104.9903, 39.7392]));
    expect((await geocodeAnywhere('1437 Bannock St, Denver, CO 80202')).region).toBe(DEN);
    expect(nyc).not.toHaveBeenCalled();
    expect(lotName('premise 12', DEN)).toBeNull();
  });

  it('asks Chicago first for an address that names it, and names no lot', async () => {
    const nyc = vi.spyOn(NYC, 'geocode');
    vi.spyOn(CHI, 'geocode').mockResolvedValue(found([-87.6563, 41.9476]));
    expect((await geocodeAnywhere('1060 W Addison St, Chicago, IL 60613')).region).toBe(CHI);
    expect(nyc).not.toHaveBeenCalled();
    expect(lotName('anything', CHI)).toBeNull();
  });

  it('asks Dallas first for an address that names it, and names no lot', async () => {
    const nyc = vi.spyOn(NYC, 'geocode');
    vi.spyOn(DAL, 'geocode').mockResolvedValue(found([-96.7958, 32.7771]));
    expect((await geocodeAnywhere('1500 Marilla St, Dallas, TX 75201')).region).toBe(DAL);
    expect(nyc).not.toHaveBeenCalled();
    expect(lotName('service 12', DAL)).toBeNull();
  });

  it('asks San Jose first for an address that names it, and names no lot', async () => {
    const nyc = vi.spyOn(NYC, 'geocode');
    vi.spyOn(SJ, 'geocode').mockResolvedValue(found([-121.8859, 37.3375]));
    expect((await geocodeAnywhere('200 E Santa Clara St, San Jose, CA 95113')).region).toBe(SJ);
    expect(nyc).not.toHaveBeenCalled();
    expect(lotName('anything', SJ)).toBeNull();
  });

  it("asks San Francisco, not San Jose, first for San Francisco's San Jose Avenue", async () => {
    expect(SJ.says?.test('1500 San Jose Ave, San Francisco')).toBe(false);
    expect(SJ.says?.test('1500 Lincoln Ave, San José')).toBe(true);
    expect(SJ.says?.test('1500 Lincoln Ave 95125')).toBe(true);
    expect(SJ.says?.test('1 Market St 94105')).toBe(false);
  });

  it('asks San Diego first for an address that names it', async () => {
    const nyc = vi.spyOn(NYC, 'geocode');
    vi.spyOn(SD, 'geocode').mockResolvedValue(found([-117.1639, 32.7157]));
    expect((await geocodeAnywhere('100 W Broadway, San Diego')).region).toBe(SD);
    expect(nyc).not.toHaveBeenCalled();
  });
});
