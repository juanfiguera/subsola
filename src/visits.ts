/**
 * Whether this browser has been to Subsola before, for analytics, without an identifier.
 *
 * PostHog keeps nothing on the device (see analytics.ts), so on its own every visit looks like a
 * first one. Rather than let it store an ID that would tie a person's visits together, the page
 * keeps a count and the day of the last visit in local storage, and each event says only
 * "returning, third to fifth visit, last seen this week". That's enough to see how many people
 * come back and how often, but no two visits can be linked to each other or to a person.
 */

const KEY = 'subsola:visits';
// One browser tab is one visit, however many pages it opens.
const SESSION_KEY = 'subsola:visit-counted';

export interface StoredVisits {
  count: number;
  /** The day of the latest visit, YYYY-MM-DD in the visitor's time zone. */
  last: string;
}

export interface VisitProperties {
  returning: boolean;
  /** Which visit this is, in ranges: '1', '2', '3-5', '6-10', '11+'. */
  visit_number: string;
  /** Days since the visit before this one, in ranges; null on a first visit. */
  days_since_last_visit: string | null;
}

const DAY_MS = 86_400_000;

const visitRange = (count: number) =>
  count <= 2 ? String(count) : count <= 5 ? '3-5' : count <= 10 ? '6-10' : '11+';

const daysRange = (days: number) =>
  days < 1 ? 'same day' : days <= 7 ? '1-7' : days <= 30 ? '8-30' : '31+';

const dayOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** What a visit on `now` stores and reports, given what the browser kept from earlier ones. */
export const nextVisit = (
  previous: StoredVisits | null,
  now: Date,
): { stored: StoredVisits; properties: VisitProperties } => {
  const today = dayOf(now);
  const count = (previous?.count ?? 0) + 1;
  const days = previous
    ? Math.round((Date.parse(today) - Date.parse(previous.last)) / DAY_MS)
    : null;
  return {
    stored: { count, last: today },
    properties: {
      returning: count > 1,
      visit_number: visitRange(count),
      days_since_last_visit: days === null || !Number.isFinite(days) ? null : daysRange(days),
    },
  };
};

/** A stored record if it is one; anything else (edited, from an older version) starts over. */
export const parseStoredVisits = (text: string | null): StoredVisits | null => {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (
      typeof value === 'object' &&
      value !== null &&
      'count' in value &&
      'last' in value &&
      typeof value.count === 'number' &&
      Number.isInteger(value.count) &&
      value.count > 0 &&
      typeof value.last === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value.last)
    )
      return { count: value.count, last: value.last };
  } catch {
    // Not JSON: treated as no record, below.
  }
  return null;
};

/** What this tab already reported, so its second page doesn't count as another visit. */
export const parseReported = (text: string | null): VisitProperties | null => {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<VisitProperties> | null;
    if (typeof value?.returning === 'boolean' && typeof value.visit_number === 'string')
      return {
        returning: value.returning,
        visit_number: value.visit_number,
        days_since_last_visit: value.days_since_last_visit ?? null,
      };
  } catch {
    // Not JSON: counted afresh, below.
  }
  return null;
};

/**
 * Counts this visit once per tab and returns what to report. With storage blocked (private
 * windows, strict settings) every visit reports as a first one, and nothing is kept.
 */
export const recordVisit = (now = new Date()): VisitProperties => {
  try {
    const reported = parseReported(sessionStorage.getItem(SESSION_KEY));
    if (reported) return reported;
    const previous = parseStoredVisits(localStorage.getItem(KEY));
    const { stored, properties } = nextVisit(previous, now);
    localStorage.setItem(KEY, JSON.stringify(stored));
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(properties));
    return properties;
  } catch (error) {
    console.info('[subsola] visit not counted, storage is unavailable', error);
    return nextVisit(null, now).properties;
  }
};
