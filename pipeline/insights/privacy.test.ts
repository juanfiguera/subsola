import { describe, expect, it } from 'vitest';
import { contactDetailsIn } from './privacy';

describe('contactDetailsIn', () => {
  it('passes counts, street segments and company names', () => {
    expect(
      contactDetailsIn({
        mostVisited: [{ block: 'WEST 56 STREET between 5 AVENUE and 6 AVENUE, MANHATTAN' }],
        topHolders: [{ holder: 'CONSOLIDATED EDISON', permits: 1316517 }],
        range: ['1990-07-20', '2026-10-24'],
        generatedAt: '2026-11-09T04:06:56.729Z',
      }),
    ).toEqual([]);
  });

  it('names the path of an email address or phone number, in values and keys', () => {
    expect(
      contactDetailsIn({
        a: [{ holder: 'call 212-555-0100' }],
        b: { 'someone@example.com': 1 },
        c: '(718) 555 0199',
      }),
    ).toEqual(['$.a[0].holder', '$.b.someone@example.com (key)', '$.c']);
  });
});
