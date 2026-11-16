import { describe, expect, it } from 'vitest';
import { waterServicesRow } from './serviceText';

describe('waterServicesRow', () => {
  it('counts lines and says how many the city lists as lead', () => {
    const row = waterServicesRow(412, 30);
    expect(row.detail).toBe('412');
    expect(row.note).toBe('30 listed as lead');
    expect(row.title).toContain('from the water main under the street into a building');
    expect(row.title).toContain('The city lists 30 of the 412 drawn here as lead.');
  });

  it('spells out a single lead line', () => {
    expect(waterServicesRow(5, 1).title).toContain(
      'The city lists one of the 5 drawn here as lead.',
    );
  });

  it('adds no note when none is lead', () => {
    const row = waterServicesRow(84, 0);
    expect(row.note).toBeNull();
    expect(row.title).toContain('None of the 84 drawn here is listed as lead.');
  });
});
