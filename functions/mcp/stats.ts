import { handleStats } from '../../server/mcp/statsRoute';

/** The D1 calls the stats page needs; the full type lives in @cloudflare/workers-types. */
interface D1Statement {
  bind: (...values: unknown[]) => D1Statement;
}
interface D1 {
  prepare: (sql: string) => D1Statement;
  batch: <T>(statements: D1Statement[]) => Promise<{ results: T[] }[]>;
}

interface Env {
  FEEDBACK_DB: D1;
  STATS_PASSWORD?: string;
}

/** The owner's stats for /mcp, behind Basic auth (server/mcp/statsRoute.ts). */
export const onRequest = ({ request, env }: { request: Request; env: Env }) =>
  handleStats(request, {
    password: env.STATS_PASSWORD,
    db: env.FEEDBACK_DB,
    now: () => new Date(),
  });
