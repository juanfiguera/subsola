import { z } from 'zod';
import { handleMcp } from '../server/mcp/protocol';
import { cellsUrlFor, indexCacheFor } from '../server/mcp/lookup';
import { KEEP_SECONDS, checkLimit } from '../server/mcp/limit';
import { saveCall } from '../server/mcp/callLog';
import { requesterOf } from '../server/mcp/requester';

// Workers forbid eval; without this zod tries new Function once to find out.
z.config({ jitless: true });

/** The D1 calls the limiter and the stats need; the full type lives in @cloudflare/workers-types. */
interface D1Statement {
  bind: (...values: unknown[]) => D1Statement;
  run: () => Promise<unknown>;
}
interface D1 {
  prepare: (sql: string) => D1Statement;
  batch: <T>(statements: D1Statement[]) => Promise<{ results: T[] }[]>;
}

interface Env {
  // The feedback database also holds the question counters: one small table, no new binding.
  FEEDBACK_DB: D1;
  FEEDBACK_SALT: string;
  // Keys the requester ID in the stats rows; apart from FEEDBACK_SALT so the two can't be joined.
  REQUESTER_KEY?: string;
  /** Where the cells are; unset, the public bucket. A self-hosted copy sets its own. */
  CELLS_URL?: string;
}

interface Context {
  request: Request;
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
}

const UPSERT =
  'INSERT INTO mcp_hits (key, bucket, n) VALUES (?1, ?2, 1) ON CONFLICT (key, bucket) DO UPDATE SET n = n + 1 RETURNING n';

/** The public MCP server at /mcp. Read-only: it reads the same cell bundles the map does. */
export const onRequest = ({ request, env, waitUntil }: Context) => {
  const now = () => new Date();
  const cellsUrl = cellsUrlFor(env.CELLS_URL, request.url);
  return handleMcp(request, {
    // The index cache lives per isolate, so warm requests skip the 1 MB index.
    lookup: { cellsUrl, cellIndex: indexCacheFor(cellsUrl) },
    now,
    // After the answer goes out. It can't share the limiter's batch: that runs before the
    // answer, and the row needs the answer's outcome and timing.
    record: (call, req) =>
      waitUntil(
        requesterOf(req, env.REQUESTER_KEY).then((requester) =>
          saveCall(env.FEEDBACK_DB, { ...call, ...requester }),
        ),
      ),
    limit: (req) =>
      checkLimit(req, {
        salt: env.FEEDBACK_SALT,
        now,
        count: async (counters) => {
          const results = await env.FEEDBACK_DB.batch<{ n: number }>(
            counters.map(({ key, bucket }) => env.FEEDBACK_DB.prepare(UPSERT).bind(key, bucket)),
          );
          // Old counters are swept on about one question in a hundred, after the answer goes out.
          if (Math.random() < 0.01)
            waitUntil(
              env.FEEDBACK_DB.prepare('DELETE FROM mcp_hits WHERE bucket < ?1')
                .bind(Math.floor(Date.now() / 1000) - KEEP_SECONDS)
                .run(),
            );
          return results.map((result) => result.results[0]?.n ?? 0);
        },
      }),
  });
};
