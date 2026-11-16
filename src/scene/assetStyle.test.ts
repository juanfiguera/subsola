import { describe, expect, it } from 'vitest';
import { isFurniture, networkOf } from './assetStyle';

describe('networkOf', () => {
  it('rings network features in their utility color', () => {
    expect(networkOf('hydrant', 'water')).toBe('water');
    expect(networkOf('catch-basin', 'sewer')).toBe('sewer');
    expect(networkOf('outfall', 'sewer')).toBe('sewer');
    expect(networkOf('manhole', 'telecom')).toBe('telecom');
    expect(networkOf('electric-structure', 'electric')).toBe('electric');
  });

  it('leaves a manhole of unknown owner unringed', () => {
    expect(networkOf('manhole', null)).toBeNull();
  });

  it('never colors street furniture, whatever it draws from the street', () => {
    expect(networkOf('street-lamp', 'electric')).toBeNull();
    expect(networkOf('traffic-signal', 'electric')).toBeNull();
    expect(networkOf('linknyc', 'telecom')).toBeNull();
    expect(isFurniture('street-lamp')).toBe(true);
    expect(isFurniture('hydrant')).toBe(false);
  });
});
