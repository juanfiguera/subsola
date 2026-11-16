import type { CallRecord } from './calls';
import type { Requester } from './requester';

/** A stats row as stored: the call, and the anonymous caller from requester.ts. */
export type CallRow = CallRecord & Requester;

/** Stats rows older than this are deleted now and then. */
export const CALL_KEEP_SECONDS = 90 * 86_400;
// About one write in this many also sweeps old rows, in the same batch.
const PRUNE_EVERY = 200;

export const INSERT_CALL =
  'INSERT INTO mcp_calls (at, method, tool, region, outcome, duration_ms, client, protocol, missed_place, requester, network, country) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)';
export const PRUNE_CALLS = 'DELETE FROM mcp_calls WHERE at < ?1';

/** The D1 calls a stats write needs; the full type lives in @cloudflare/workers-types. */
export interface CallDb<Statement> {
  prepare: (sql: string) => { bind: (...values: unknown[]) => Statement };
  batch: (statements: Statement[]) => Promise<unknown>;
}

/**
 * Stores one stats row, sweeping rows past CALL_KEEP_SECONDS about once in PRUNE_EVERY writes.
 * Never rejects: the stats are for the owner, and a write that fails must not touch the answer.
 */
export const saveCall = async <Statement>(
  db: CallDb<Statement>,
  call: CallRow,
  random: () => number = Math.random,
): Promise<void> => {
  const statements = [
    db
      .prepare(INSERT_CALL)
      .bind(
        call.at,
        call.method,
        call.tool,
        call.region,
        call.outcome,
        call.durationMs,
        call.client,
        call.protocol,
        call.missedPlace,
        call.requester,
        call.network,
        call.country,
      ),
  ];
  if (random() < 1 / PRUNE_EVERY)
    statements.push(db.prepare(PRUNE_CALLS).bind(call.at - CALL_KEEP_SECONDS));
  try {
    await db.batch(statements);
  } catch (error) {
    console.error('mcp stats: write failed', error instanceof Error ? error.message : error);
  }
};
