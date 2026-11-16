import type { CheckResult, FailureReason } from '../../../server/mcp/healthCheck';

/** Rows older than this are deleted now and then. */
export const HEALTH_KEEP_SECONDS = 30 * 86_400;
// About one run in this many also sweeps old rows: at one run every 5 minutes, about daily.
const PRUNE_EVERY = 250;

export const LAST_TWO = 'SELECT at, ok FROM health_checks ORDER BY at DESC, id DESC LIMIT 2';
// When the current run of failures began: the first failure after the latest pass.
export const STREAK_START =
  'SELECT MIN(at) AS since FROM health_checks WHERE ok = 0 AND at > COALESCE((SELECT MAX(at) FROM health_checks WHERE ok = 1), 0)';
export const INSERT_CHECK =
  'INSERT INTO health_checks (at, ok, duration_ms, reason, message) VALUES (?1, ?2, ?3, ?4, ?5)';
export const PRUNE_CHECKS = 'DELETE FROM health_checks WHERE at < ?1';

/** The D1 calls the recording needs; the full type lives in @cloudflare/workers-types. */
export interface HealthDb<Statement> {
  prepare: (sql: string) => { bind: (...values: unknown[]) => Statement };
  batch: <T>(statements: Statement[]) => Promise<{ results: T[] }[]>;
}

export type Alert =
  | { kind: 'failing'; at: number; since: number; reason: FailureReason; message: string }
  | { kind: 'recovered'; at: number; since: number };

interface Previous {
  at: number;
  ok: number;
}

/**
 * Whether this run changes the state worth an email. Failing means two failures in a row, so one
 * blip stays quiet; it fires once, on the second. Recovered fires on the first pass after that.
 */
export const alertFor = (
  result: CheckResult,
  at: number,
  previous: Previous[],
  streakStart: number | null,
): Alert | null => {
  const [last, beforeLast] = previous;
  const lastFailed = last !== undefined && last.ok === 0;
  const beforeLastFailed = beforeLast !== undefined && beforeLast.ok === 0;
  const failure = result.failures[0];
  if (!result.ok && failure && lastFailed && !beforeLastFailed)
    return {
      kind: 'failing',
      at,
      since: last.at,
      reason: failure.reason,
      message: failure.message,
    };
  if (result.ok && lastFailed && beforeLastFailed)
    return { kind: 'recovered', at, since: streakStart ?? beforeLast.at };
  return null;
};

/**
 * Stores the run and returns the alert it calls for, if any. The reads and the insert go in one
 * batch, so the state is read just before this run is added.
 */
export const recordRun = async <Statement>(
  db: HealthDb<Statement>,
  result: CheckResult,
  at: number,
  random: () => number = Math.random,
): Promise<Alert | null> => {
  const failure = result.failures[0];
  const statements = [
    db.prepare(LAST_TWO).bind(),
    db.prepare(STREAK_START).bind(),
    db
      .prepare(INSERT_CHECK)
      .bind(
        at,
        result.ok ? 1 : 0,
        result.durationMs,
        failure?.reason ?? null,
        failure?.message ?? null,
      ),
  ];
  if (random() < 1 / PRUNE_EVERY)
    statements.push(db.prepare(PRUNE_CHECKS).bind(at - HEALTH_KEEP_SECONDS));
  const results = await db.batch<Record<string, unknown>>(statements);
  const previous = (results[0]?.results ?? []) as unknown as Previous[];
  const since = (results[1]?.results[0] as { since: number | null } | undefined)?.since ?? null;
  return alertFor(result, at, previous, since);
};
