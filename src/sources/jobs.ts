import type { PermitRecord } from './permits';

/**
 * Permits that are one job filed again and again. A city permit allows the street open for a few
 * weeks, so a job that drags on is re-permitted month after month: Con Edison's "Repair Steam -
 * 201804340" on Water St opened the street on 50 permits, February 2018 to June 2022 (NYC marks 37
 * of them "Renew" and 7 "Extend"). Shown as a flag so a long-running dig reads as one job, not 50.
 */

export interface PermitJob {
  /** The utility's own work order, where the permit names one. */
  workOrder: string | null;
  /** Permits in the job. */
  permits: number;
  /** This permit's place in the job, 1 for the first. */
  nth: number;
  /** YYYY-MM-DD: the first permit's start and the last one's end. */
  since: string;
  through: string;
  /**
   * Permits the city itself filed as a renewal or extension (New York says so on each permit), or
   * null where it doesn't: a job is then known only by its matching permits.
   */
  renewals: number | null;
}

/** From this many permits a job is called out; one renewal is routine. */
export const REPEATED_JOB_MIN = 3;

// Utilities write their work order into the purpose ("Repair Steam - 201804340", "SDGE -
// 300000796946 ..."); permit numbers carry letters, so a bare 7 to 12 digit run is the order.
const WORK_ORDER = /(?<!\w)(?<!\w-)\d{7,12}(?![\w-])/;

// A work order is the same job however long the gap (crews wait on a part or a season), within
// reason; without one, the next permit has to follow closely to count as a renewal.
const WORK_ORDER_GAP_DAYS = 180;
const GAP_DAYS = 45;

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS;

const normalize = (text: string | undefined) =>
  (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const workOrderOf = (purpose: string | undefined) => purpose?.match(WORK_ORDER)?.[0] ?? null;

const jobKey = (record: PermitRecord, workOrder: string | null) => {
  const who = `${normalize(record.permittee)}|${record.utility}`;
  // A work order can span blocks; the same words by the same holder are a job only on one street.
  return workOrder
    ? `${who}|order ${workOrder}`
    : `${who}|${normalize(record.purpose ?? record.type)}|${normalize(record.street)}`;
};

/**
 * Each permit's job, by permit number, for permits in a job of two or more. Read it over every
 * permit near a place, before any date or utility filter, so a job's early permits still count.
 */
export const permitJobs = (records: Iterable<PermitRecord>): Map<string, PermitJob> => {
  const byKey = new Map<string, { record: PermitRecord; start: number; end: number }[]>();
  const workOrders = new Map<string, string | null>();
  const seen = new Set<string>();
  for (const record of records) {
    // A permit filed for several blocks appears once per block.
    if (seen.has(record.permitNumber)) continue;
    seen.add(record.permitNumber);
    const startDate = record.workStart ?? record.issued;
    if (!startDate) continue;
    const start = dayNumber(startDate);
    const end = record.workEnd ? Math.max(start, dayNumber(record.workEnd)) : start;
    const workOrder = workOrderOf(record.purpose);
    const key = jobKey(record, workOrder);
    workOrders.set(key, workOrder);
    const list = byKey.get(key) ?? [];
    list.push({ record, start, end });
    byKey.set(key, list);
  }
  const jobs = new Map<string, PermitJob>();
  for (const [key, list] of byKey) {
    if (list.length < 2) continue;
    const workOrder = workOrders.get(key) ?? null;
    const gap = workOrder ? WORK_ORDER_GAP_DAYS : GAP_DAYS;
    list.sort((a, b) => a.start - b.start || a.end - b.end);
    // Split where the street sat closed past the gap: the same words years apart are a new job.
    let run: typeof list = [];
    let runEnd = -Infinity;
    const close = () => {
      if (run.length >= 2) {
        const since = run[0]!.record.workStart ?? run[0]!.record.issued!;
        const last = run.reduce((latest, item) => (item.end > latest.end ? item : latest));
        const through = last.record.workEnd ?? last.record.workStart ?? last.record.issued!;
        const renewals = run.filter((item) => item.record.renews).length;
        run.forEach((item, index) =>
          jobs.set(item.record.permitNumber, {
            workOrder,
            permits: run.length,
            nth: index + 1,
            since,
            through,
            renewals: renewals || null,
          }),
        );
      }
      run = [];
      runEnd = -Infinity;
    };
    for (const item of list) {
      if (run.length && item.start - runEnd > gap) close();
      run.push(item);
      runEnd = Math.max(runEnd, item.end);
    }
    close();
  }
  return jobs;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

/** "Same job permitted 50 times, Feb 2018 to Jun 2022", or null for a job too short to call out. */
export const jobNote = (job: PermitJob | undefined, today?: string) => {
  if (!job || job.permits < REPEATED_JOB_MIN) return null;
  const until = today && job.through >= today ? 'now' : monthYear(job.through);
  const span =
    until === 'now' ? `since ${monthYear(job.since)}` : `${monthYear(job.since)} to ${until}`;
  const filed = job.renewals ? `, ${job.renewals} filed by the city as renewals or extensions` : '';
  return `Same job permitted ${job.permits} times, ${span}${filed}`;
};
