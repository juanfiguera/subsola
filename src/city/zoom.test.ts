import { describe, expect, it } from 'vitest';
import { mapZoomFor, sceneZoomFor } from './zoom';

describe('mapZoomFor', () => {
  it('gives the web map zoom with the same meters per pixel as the street view', () => {
    const lat = 40.7;
    const mapZoom = mapZoomFor(0.5, lat);
    // MapLibre's ground resolution: circumference times cos(lat) over 512 * 2^zoom.
    const metersPerPixel =
      (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** mapZoom);
    expect(metersPerPixel).toBeCloseTo(1 / 2 ** 0.5, 6);
  });

  it('round-trips through sceneZoomFor', () => {
    expect(sceneZoomFor(mapZoomFor(2.3, 40.6), 40.6)).toBeCloseTo(2.3, 9);
  });
});
