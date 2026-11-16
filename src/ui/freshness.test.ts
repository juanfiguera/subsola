import { describe, expect, it } from 'vitest';
import { recordsFreshness } from './freshness';

describe('recordsFreshness', () => {
  const now = new Date('2026-10-29T18:00:00Z');

  it('dates the build in New York time', () => {
    // 2 am UTC on the 29th is still the 28th in New York.
    expect(recordsFreshness('2026-10-29T02:00:00Z', now)).toEqual({
      date: 'October 28, 2026',
      stale: false,
    });
  });

  it('marks a build older than three days as stale', () => {
    expect(recordsFreshness('2026-10-26T17:00:00Z', now)?.stale).toBe(true);
    expect(recordsFreshness('2026-10-26T19:00:00Z', now)?.stale).toBe(false);
  });

  it('ignores a date it cannot read', () => {
    expect(recordsFreshness('not a date', now)).toBeNull();
  });
});
