import { describe, expect, it, vi } from 'vitest';
import type { Dig } from './cells';
import { CITIES, figure } from './common';
import { permitInsights, permitRates } from './permits';

const dig = (start: string, block: string): Dig => {
  const day = Math.floor(Date.parse(start) / 86_400_000);
  return {
    city: 'chi',
    block,
    utility: 'water',
    holder: 'Chicago Water Management',
    dataset: 'chiPermits',
    issued: day,
    start: day,
    end: null,
    street: 'N Lakewood Ave',
    opening: true,
  };
};

describe('permitInsights', () => {
  it('leaves out a city with no permits rather than failing on it', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const digs = [
      dig('2023-03-01', 'chi|1'),
      dig('2024-05-01', 'chi|1'),
      dig('2025-07-01', 'chi|2'),
    ];
    const permits = permitInsights(digs, new Map([['chi|1', 'N LAKEWOOD AVE']]));
    expect(Object.keys(permits)).toEqual(['chi']);
    expect(permits.chi?.permits.value).toBe(3);
    const miles = Object.fromEntries(
      CITIES.map((city) => [city, figure(100, { datasets: [], filter: '' })]),
    ) as Parameters<typeof permitRates>[1];
    const rates = permitRates(permits, miles).value as Record<string, unknown>;
    expect(rates.nyc).toBeNull();
    expect(rates.chi).toEqual({ permitsPerYear: 1, perStreetMilePerYear: 0.01 });
  });
});
