import { describe, expect, it } from 'vitest';
import { CITY_DATASETS } from './datasets';
import { keepsLastGood } from './lastGood';

describe('keepsLastGood', () => {
  it('keeps a fallback for every layer outside NYC, so one city server cannot stop the night', () => {
    for (const [city, specs] of Object.entries(CITY_DATASETS)) {
      if (city === 'nyc') continue;
      for (const spec of specs) expect(keepsLastGood(spec), spec.name).toBe(true);
    }
  });

  it("keeps none for NYC Open Data's required layers, which would overrun the cache", () => {
    const big = CITY_DATASETS.nyc.filter((spec) =>
      ['buildings', 'roadbed', 'sidewalks', 'permitsHistoric'].includes(spec.name),
    );
    expect(big).toHaveLength(4);
    for (const spec of big) expect(keepsLastGood(spec), spec.name).toBe(false);
  });
});
