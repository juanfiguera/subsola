import type { Feature, Geometry } from 'geojson';
import type { PermitGroupProperties, PermitRecord } from './sources/permits';

export interface ActiveWork {
  /** Index into the permit groups, which is also how the scene and cards refer to the block. */
  groupIndex: number;
  record: PermitRecord;
}

/** Today in New York as YYYY-MM-DD, the format DOT work dates use. */
export const nycToday = (now = new Date()) =>
  now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** A permit that opens the street with a work window that includes `today`. */
export const isOpenOn = (record: PermitRecord, today: string) =>
  Boolean(
    !record.noOpening &&
    record.workStart &&
    record.workEnd &&
    record.workStart <= today &&
    today <= record.workEnd,
  );

/** Blocks with a permit whose work window includes today, the soonest-ending first. */
export const activeWork = (
  groups: Feature<Geometry, PermitGroupProperties>[],
  today: string,
): ActiveWork[] =>
  groups
    .flatMap((group, groupIndex) => {
      const record = group.properties.permits.find((r) => isOpenOn(r, today));
      return record ? [{ groupIndex, record }] : [];
    })
    .sort((a, b) => (a.record.workEnd ?? '').localeCompare(b.record.workEnd ?? ''));
