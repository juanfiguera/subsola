/**
 * How current the citywide build's records are. The nightly job rebuilds them every day, so
 * a build older than a few days means the job has been failing and the map is missing recent
 * digs. Live loads read NYC Open Data directly and are always current.
 */
export interface RecordsFreshness {
  /** "October 29, 2026", in New York time. */
  date: string;
  stale: boolean;
}

const STALE_AFTER_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export const recordsFreshness = (builtAt: string, now: Date): RecordsFreshness | null => {
  const built = new Date(builtAt);
  if (Number.isNaN(built.getTime())) return null;
  return {
    date: built.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/New_York',
    }),
    stale: now.getTime() - built.getTime() > STALE_AFTER_DAYS * DAY_MS,
  };
};
