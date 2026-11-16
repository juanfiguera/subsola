import { describe, expect, it } from 'vitest';
import { ANALYZED_AREAS, middleStop } from './areas';

const westSt = ANALYZED_AREAS.find((area) => area.name.startsWith('West St'))!;
describe('middleStop', () => {
  it('opens a street at the stop nearest its middle', () => {
    expect(['85 West St, Brooklyn, NY 11222', '150 West St, Brooklyn, NY 11222']).toContain(
      middleStop(westSt).address,
    );
  });
});
