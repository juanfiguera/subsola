import { describe, expect, it } from 'vitest';
import { nextVisit, parseReported, parseStoredVisits } from './visits';

const on = (day: string) => new Date(`${day}T15:00:00`);

describe('nextVisit', () => {
  it('reports a first visit and starts the count', () => {
    expect(nextVisit(null, on('2026-11-10'))).toEqual({
      stored: { count: 1, last: '2026-11-10' },
      properties: { returning: false, visit_number: '1', days_since_last_visit: null },
    });
  });

  it('reports a return in ranges, never the dates themselves', () => {
    expect(nextVisit({ count: 1, last: '2026-11-10' }, on('2026-11-10')).properties).toEqual({
      returning: true,
      visit_number: '2',
      days_since_last_visit: 'same day',
    });
    expect(nextVisit({ count: 4, last: '2026-11-03' }, on('2026-11-10')).properties).toEqual({
      returning: true,
      visit_number: '3-5',
      days_since_last_visit: '1-7',
    });
    expect(nextVisit({ count: 9, last: '2026-10-20' }, on('2026-11-10')).properties).toMatchObject({
      visit_number: '6-10',
      days_since_last_visit: '8-30',
    });
    expect(nextVisit({ count: 40, last: '2026-01-02' }, on('2026-11-10')).properties).toMatchObject(
      { visit_number: '11+', days_since_last_visit: '31+' },
    );
  });

  it('keeps only the count and the day', () => {
    expect(nextVisit({ count: 2, last: '2026-11-01' }, on('2026-11-10')).stored).toEqual({
      count: 3,
      last: '2026-11-10',
    });
  });
});

describe('parseStoredVisits', () => {
  it('reads a record it wrote', () => {
    expect(parseStoredVisits('{"count":3,"last":"2026-11-10"}')).toEqual({
      count: 3,
      last: '2026-11-10',
    });
  });

  it('starts over from anything else', () => {
    for (const text of [null, '', 'nope', '[]', '{"count":0,"last":"2026-11-10"}', '{"count":2}'])
      expect(parseStoredVisits(text)).toBeNull();
  });
});

describe('parseReported', () => {
  it('reuses what the tab already reported', () => {
    const properties = { returning: true, visit_number: '2', days_since_last_visit: '1-7' };
    expect(parseReported(JSON.stringify(properties))).toEqual(properties);
    expect(parseReported('null')).toBeNull();
    expect(parseReported('{')).toBeNull();
  });
});
