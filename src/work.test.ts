import { describe, expect, it } from 'vitest';
import type { Feature, Geometry } from 'geojson';
import { activeWork, todayIn } from './work';
import type { PermitGroupProperties, PermitRecord } from './sources/permits';

const record = (workStart: string, workEnd: string): PermitRecord => ({
  permitNumber: `${workStart}-${workEnd}`,
  utility: 'gas',
  type: 'OPENING',
  permittee: 'CON EDISON',
  issued: workStart,
  workStart,
  workEnd,
  status: undefined,
  street: '37 STREET',
  purpose: undefined,
  locationNote: undefined,
  mentionsMain: false,
  dataset: 'permitsCurrent',
});

const group = (...permits: PermitRecord[]): Feature<Geometry, PermitGroupProperties> => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [0, 0] },
  properties: {
    key: 'test-block',
    utility: 'gas',
    count: permits.length,
    firstYear: null,
    lastYear: null,
    mainCount: 0,
    permits,
    geometryKind: 'point',
  },
});

describe('activeWork', () => {
  it('keeps blocks whose work window includes today, soonest-ending first', () => {
    const groups = [
      group(record('2026-10-01', '2026-11-10')),
      group(record('2026-09-01', '2026-09-30')),
      group(record('2026-10-20', '2026-10-24')),
    ];
    expect(activeWork(groups, '2026-10-24').map((w) => w.groupIndex)).toEqual([2, 0]);
  });

  it('ignores permits without dates', () => {
    expect(activeWork([group({ ...record('', ''), workStart: undefined })], '2026-10-24')).toEqual(
      [],
    );
  });
});

describe('todayIn', () => {
  it("uses the city's time, not UTC", () => {
    expect(todayIn('America/New_York', new Date('2026-10-25T02:00:00Z'))).toBe('2026-10-24');
  });

  it('keeps the West Coast on its own day after 9 pm there', () => {
    const lateInSanJose = new Date('2026-11-24T05:30:00Z');
    expect(todayIn('America/New_York', lateInSanJose)).toBe('2026-11-24');
    expect(todayIn('America/Los_Angeles', lateInSanJose)).toBe('2026-11-23');
  });
});
