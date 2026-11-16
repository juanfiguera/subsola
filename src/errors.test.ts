import { describe, expect, it } from 'vitest';
import { withoutQuery, withoutQuoted } from './errors';

describe('error report scrubbing', () => {
  it('drops the address from URLs and messages', () => {
    expect(withoutQuery('https://subsola.com/?q=12+Main+St&cam=40.7,-73.9')).toBe(
      'https://subsola.com/',
    );
    expect(withoutQuoted('[subsola] Couldn\'t find "12 Main St" in New York City')).toBe(
      '[subsola] Couldn\'t find "…" in New York City',
    );
  });
});
