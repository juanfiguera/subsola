import { describe, expect, it } from 'vitest';
import { materialOf } from './services';

describe('materialOf', () => {
  it('reads every material DEP publishes', () => {
    expect(materialOf('Lead')).toBe('lead');
    expect(materialOf('Non-Lead')).toBe('non-lead');
    expect(materialOf('Galvanized Service Line Requiring Replacement')).toBe('galvanized');
    expect(materialOf('Unknown - Lead Status Unknown')).toBe('unknown');
    expect(materialOf('Non-Applicable')).toBeNull();
  });
});
