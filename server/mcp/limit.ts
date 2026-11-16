import { sha256 } from '../hash';

/**
 * How many questions /mcp answers. Each answer geocodes an address with a city's service and
 * loads map cells, about half a second of CPU, so a loop or a flood costs real money and leans on
 * the cities' geocoders. The zone's one rate-limiting rule is spent on the map data, and Pages
 * Functions can't use the rate-limit binding, so the counting is done here, in D1.
 */
export const LIMITS = [
  { name: 'visitor-minute', seconds: 60, max: 30, perVisitor: true },
  { name: 'visitor-day', seconds: 86_400, max: 600, perVisitor: true },
  // Caps the worst case across every address at once to a few dollars of CPU a day.
  { name: 'all-minute', seconds: 60, max: 300, perVisitor: false },
] as const;

/** Adds one to each counter and returns the new totals, in order. */
export type CountHits = (counters: { key: string; bucket: number }[]) => Promise<number[]>;

export interface LimitDeps {
  count: CountHits;
  /** Mixed into the visitor hash, so stored keys can't be matched back to an IP. */
  salt: string;
  now: () => Date;
}

/** Seconds until the caller may ask again, or null when the question can be answered. */
export const checkLimit = async (request: Request, deps: LimitDeps): Promise<number | null> => {
  const visitor = await sha256(
    `${deps.salt}|${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`,
  );
  const nowSeconds = Math.floor(deps.now().getTime() / 1000);
  const counters = LIMITS.map((limit) => ({
    key: limit.perVisitor ? `${limit.name}:${visitor}` : limit.name,
    bucket: nowSeconds - (nowSeconds % limit.seconds),
  }));
  let totals: number[];
  try {
    totals = await deps.count(counters);
  } catch (error) {
    // A counting outage shouldn't take the server down with it; the cap is a guard, not a gate.
    console.error('mcp limit: counting failed', error instanceof Error ? error.message : error);
    return null;
  }
  const over = LIMITS.map((limit, i) =>
    (totals[i] ?? 0) > limit.max ? counters[i]!.bucket + limit.seconds - nowSeconds : 0,
  );
  const wait = Math.max(...over);
  return wait > 0 ? wait : null;
};

/** Counters older than this are no use to any limit and are deleted now and then. */
export const KEEP_SECONDS = 2 * 86_400;
