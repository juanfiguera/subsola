import type { PermitRecord } from './permits';

/**
 * Permit dates for sorting and showing. Kept out of permits.ts, which the map loads lazily since
 * it pulls in the NYC download and the projection code, so cards and the report can use them.
 */

type Dated = Pick<PermitRecord, 'issued' | 'workStart'>;

/**
 * The day a permit counts from when sorting, filtering or bucketing by date: its issue date, or
 * the day its work starts where the city publishes no issue date.
 */
export const permitDay = (record: Dated) => record.issued ?? record.workStart;

/** Newest first by `permitDay`; undated permits last. */
export const byPermitDayDesc = (a: Dated, b: Dated) =>
  (permitDay(b) ?? '').localeCompare(permitDay(a) ?? '');

/** A permit's date for a list: the issue date, else "Starts <day>", else `undated`. */
export const permitDateText = (record: Dated, undated = 'Undated') =>
  record.issued ?? (record.workStart ? `Starts ${record.workStart}` : undated);
