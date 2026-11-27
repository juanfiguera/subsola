import { HEALTH_CLIENT } from './calls';

/**
 * What /mcp/stats shows, read from mcp_calls (migrations/0003 and 0004) and health_checks (0004)
 * in one D1 batch. The health check's own calls are left out of every figure, so its runs don't
 * drown out real use; its panel reads health_checks, which the check Worker writes itself.
 */

export const RANGES = {
  '24h': { label: '24 hours', seconds: 86_400, bucket: 3_600 },
  '7d': { label: '7 days', seconds: 7 * 86_400, bucket: 86_400 },
  '30d': { label: '30 days', seconds: 30 * 86_400, bucket: 86_400 },
} as const;

export type RangeId = keyof typeof RANGES;

export const rangeOf = (value: string | null): RangeId =>
  value !== null && value in RANGES ? (value as RangeId) : '7d';

export interface Count {
  label: string | null;
  n: number;
}

export interface HealthCheck {
  at: number;
  ok: boolean;
  durationMs: number;
  reason: string | null;
  message: string | null;
}

/** One anonymous caller in the range (requester.ts), most calls first. */
export interface RequesterRow {
  requester: string;
  network: string | null;
  country: string | null;
  calls: number;
  toolCalls: number;
  answered: number;
  /** Region ids asked about, most asked first. */
  regions: string[];
  /** App families seen (client), most calls first. */
  clients: string[];
  firstSeen: number;
  lastSeen: number;
  /** Distinct UTC days with a call. */
  days: number;
}

/** Rate-limited calls from one network; a null network is one Cloudflare didn't name. */
export interface LimitedNetwork {
  network: string | null;
  limited: number;
  /** Distinct requesters on this network that were limited. */
  requesters: number;
  /** Every call from this network in the range, limited or not. */
  calls: number;
}

export interface Stats {
  range: RangeId;
  /** Unix seconds. */
  now: number;
  total: number;
  toolCalls: number;
  answered: number;
  /** Of tools/call, in ms; null with no calls. */
  p50: number | null;
  p95: number | null;
  /** Calls per bucket (an hour for 24h, a UTC day otherwise), oldest first, empty ones included. */
  series: Count[];
  byTool: Count[];
  byCity: Count[];
  byOutcome: Count[];
  byClient: Count[];
  byMethod: Count[];
  /** Outside-coverage misses by place; a null label is a miss whose place wasn't recognized. */
  missed: Count[];
  /** Bad-argument calls by what failed ("address:missing"); null on rows from before 0005. */
  badArgs: Count[];
  /** Distinct requesters in the range; calls from before 0004 have none and aren't counted. */
  requesterCount: number;
  requesters: RequesterRow[];
  limitedByNetwork: LimitedNetwork[];
  /** Distinct requesters limited at least once in the range. */
  limitedRequesters: number;
  health: {
    latest: HealthCheck | null;
    /** Runs and passes in the last 24 hours. */
    total: number;
    passed: number;
    lastFailure: HealthCheck | null;
  };
}

/** A requester active on this many distinct days in the range counts as a regular. */
export const REGULAR_DAYS = 3;

/** The D1 calls the stats need; the full type lives in @cloudflare/workers-types. */
export interface StatsDb<Statement> {
  prepare: (sql: string) => { bind: (...values: unknown[]) => Statement };
  batch: <T>(statements: Statement[]) => Promise<{ results: T[] }[]>;
}

// ?1 is the range's start, ?2 the health check's label.
const REAL = 'FROM mcp_calls WHERE at >= ?1 AND client != ?2';
const TOOL_CALLS = `${REAL} AND method = 'tools/call'`;
const grouped = (column: string, where: string) =>
  `SELECT ${column} AS label, COUNT(*) AS n ${where} GROUP BY ${column} ORDER BY n DESC, label LIMIT 50`;

// Nearest rank: the ceil(n * p)th smallest, in integer arithmetic.
const PERCENTILES = `SELECT
  MAX(CASE WHEN rn = (n * 50 + 99) / 100 THEN d END) AS p50,
  MAX(CASE WHEN rn = (n * 95 + 99) / 100 THEN d END) AS p95
FROM (SELECT duration_ms AS d, ROW_NUMBER() OVER (ORDER BY duration_ms) AS rn, COUNT(*) OVER () AS n ${TOOL_CALLS})`;

const HEALTH_ROW = 'SELECT at, ok, duration_ms AS durationMs, reason, message FROM health_checks';

// The unit separator, char(31) in SQL: no label holds it.
const SEPARATOR = '\x1f';

// Region and client lists come back as text and are split in loadStats; GROUP_CONCAT can't
// order, so each list is built from a ranked subquery.
const REQUESTERS = `WITH real AS (SELECT * ${REAL} AND requester IS NOT NULL),
people AS (
  SELECT requester, MAX(network) AS network, MAX(country) AS country, COUNT(*) AS calls,
    SUM(method = 'tools/call') AS toolCalls, SUM(method = 'tools/call' AND outcome = 'answered') AS answered,
    MIN(at) AS firstSeen, MAX(at) AS lastSeen, COUNT(DISTINCT at / 86400) AS days
  FROM real GROUP BY requester ORDER BY calls DESC, requester LIMIT 50
),
regions AS (
  SELECT requester, GROUP_CONCAT(region, char(31)) AS regions FROM (
    SELECT requester, region, COUNT(*) AS n FROM real
    WHERE region IS NOT NULL AND requester IN (SELECT requester FROM people)
    GROUP BY requester, region ORDER BY requester, n DESC, region
  ) GROUP BY requester
),
clients AS (
  SELECT requester, GROUP_CONCAT(client, char(31)) AS clients FROM (
    SELECT requester, client, COUNT(*) AS n FROM real
    WHERE requester IN (SELECT requester FROM people)
    GROUP BY requester, client ORDER BY requester, n DESC, client
  ) GROUP BY requester
)
SELECT people.*, regions.regions, clients.clients FROM people
LEFT JOIN regions USING (requester) LEFT JOIN clients USING (requester)
ORDER BY calls DESC, requester`;

const LIMITED_BY_NETWORK = `SELECT network, SUM(outcome = 'rate_limited') AS limited,
  COUNT(DISTINCT CASE WHEN outcome = 'rate_limited' THEN requester END) AS requesters, COUNT(*) AS calls
${REAL} GROUP BY network HAVING limited > 0 ORDER BY limited DESC, network LIMIT 50`;

/**
 * Where a range starts: whole buckets, the current one included, so every call counted is in a
 * bar ("7 days" is today and the six UTC days before it).
 */
export const rangeStart = (range: RangeId, now: number) => {
  const { seconds, bucket } = RANGES[range];
  return now - (now % bucket) - (seconds / bucket - 1) * bucket;
};

/** Every bucket from `since` to now, the empty ones too, so gaps show as gaps. */
const fillSeries = (
  rows: { start: number; n: number }[],
  since: number,
  now: number,
  bucket: number,
) => {
  const counts = new Map(rows.map((row) => [row.start, row.n]));
  const series: Count[] = [];
  for (let start = since; start <= now; start += bucket)
    series.push({ label: String(start), n: counts.get(start) ?? 0 });
  return series;
};

type HealthQueryRow = Omit<HealthCheck, 'ok'> & { ok: number };
const healthCheck = (row: HealthQueryRow | undefined): HealthCheck | null =>
  row ? { ...row, ok: row.ok === 1 } : null;

type RequesterQueryRow = Omit<RequesterRow, 'regions' | 'clients'> & {
  regions: string | null;
  clients: string | null;
};
const requesterRow = ({ regions, clients, ...row }: RequesterQueryRow): RequesterRow => ({
  ...row,
  regions: regions ? regions.split(SEPARATOR) : [],
  clients: clients ? clients.split(SEPARATOR) : [],
});

export const loadStats = async <Statement>(
  db: StatsDb<Statement>,
  range: RangeId,
  now: number,
): Promise<Stats> => {
  const { bucket } = RANGES[range];
  const since = rangeStart(range, now);
  const real = (sql: string) => db.prepare(sql).bind(since, HEALTH_CLIENT);
  const statements = [
    real(
      `SELECT COUNT(*) AS total, COALESCE(SUM(method = 'tools/call' AND outcome != 'unknown_tool'), 0) AS toolCalls, COALESCE(SUM(method = 'tools/call' AND outcome = 'answered'), 0) AS answered ${REAL}`,
    ),
    real(PERCENTILES),
    // A bound number can arrive as REAL, which would make the division fractional.
    db
      .prepare(
        `SELECT CAST(at / ?3 AS INTEGER) * ?3 AS start, COUNT(*) AS n ${REAL} GROUP BY start`,
      )
      .bind(since, HEALTH_CLIENT, bucket),
    real(grouped('tool', TOOL_CALLS)),
    real(grouped('region', TOOL_CALLS)),
    real(grouped('outcome', TOOL_CALLS)),
    real(grouped('client', REAL)),
    real(grouped('method', REAL)),
    real(grouped('missed_place', `${REAL} AND outcome = 'outside_coverage'`)),
    db.prepare(`${HEALTH_ROW} ORDER BY at DESC, id DESC LIMIT 1`).bind(),
    db
      .prepare(
        'SELECT COUNT(*) AS total, COALESCE(SUM(ok), 0) AS passed FROM health_checks WHERE at >= ?1',
      )
      .bind(now - 86_400),
    db.prepare(`${HEALTH_ROW} WHERE ok = 0 ORDER BY at DESC, id DESC LIMIT 1`).bind(),
    real(`SELECT COUNT(DISTINCT requester) AS n ${REAL}`),
    real(REQUESTERS),
    real(LIMITED_BY_NETWORK),
    real(`SELECT COUNT(DISTINCT requester) AS n ${REAL} AND outcome = 'rate_limited'`),
    real(grouped('problem', `${REAL} AND outcome = 'bad_args'`)),
  ];
  const results = await db.batch<Record<string, unknown>>(statements);
  const rows = <T>(i: number) => (results[i]?.results ?? []) as T[];
  const totals = rows<{ total: number; toolCalls: number; answered: number }>(0)[0];
  const percentiles = rows<{ p50: number | null; p95: number | null }>(1)[0];
  const health = rows<{ total: number; passed: number }>(10)[0];
  const count = (i: number) => rows<{ n: number }>(i)[0]?.n ?? 0;
  return {
    range,
    now,
    total: totals?.total ?? 0,
    toolCalls: totals?.toolCalls ?? 0,
    answered: totals?.answered ?? 0,
    p50: percentiles?.p50 ?? null,
    p95: percentiles?.p95 ?? null,
    series: fillSeries(rows<{ start: number; n: number }>(2), since, now, bucket),
    byTool: rows<Count>(3),
    byCity: rows<Count>(4),
    byOutcome: rows<Count>(5),
    byClient: rows<Count>(6),
    byMethod: rows<Count>(7),
    missed: rows<Count>(8),
    requesterCount: count(12),
    requesters: rows<RequesterQueryRow>(13).map(requesterRow),
    limitedByNetwork: rows<LimitedNetwork>(14),
    limitedRequesters: count(15),
    badArgs: rows<Count>(16),
    health: {
      latest: healthCheck(rows<HealthQueryRow>(9)[0]),
      total: health?.total ?? 0,
      passed: health?.passed ?? 0,
      lastFailure: healthCheck(rows<HealthQueryRow>(11)[0]),
    },
  };
};
