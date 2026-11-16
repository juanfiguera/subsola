import { describe, expect, it } from 'vitest';
import { issuedSince, sinceChoices, splitAtYear } from './brief';

describe('comparing digs since a year', () => {
  it('splits permit counts at the chosen year, counting that year as since', () => {
    const byYear = new Map([
      [2009, 2],
      [2015, 3],
      [2021, 4],
    ]);
    expect(splitAtYear(byYear, 2015)).toEqual({ after: 7, before: 2 });
    expect(splitAtYear(byYear, 2030)).toEqual({ after: 0, before: 9 });
  });

  it('offers every fifth year after the first record, newest first', () => {
    expect(sinceChoices(1999, 2026)).toEqual([2025, 2020, 2015, 2010, 2005, 2000]);
    expect(sinceChoices(2020, 2026)).toEqual([2025]);
    expect(sinceChoices(null, 2026)).toEqual([]);
  });

  it('keeps undated digs out of a since filter', () => {
    expect(issuedSince('2016-03-01', 2015)).toBe(true);
    expect(issuedSince('2014-12-31', 2015)).toBe(false);
    expect(issuedSince(undefined, 2015)).toBe(false);
    expect(issuedSince(undefined, null)).toBe(true);
  });
});
