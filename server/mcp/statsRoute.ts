import { authorized } from './basicAuth';
import { newNonce } from './page';
import { loadStats, rangeOf, type StatsDb } from './stats';
import { statsPage, statsPageHeaders } from './statsPage';

export interface StatsRouteDeps<Statement> {
  /** STATS_PASSWORD; unset, the page stays shut. */
  password: string | undefined;
  db: StatsDb<Statement>;
  now: () => Date;
}

// Every reply, the refusals too, stays out of caches and search results.
const PRIVATE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

const text = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...PRIVATE, ...extra },
  });

/** GET /mcp/stats: the stats page for whoever has the password. */
export const handleStats = async <Statement>(
  request: Request,
  deps: StatsRouteDeps<Statement>,
): Promise<Response> => {
  if (!deps.password) console.error('mcp stats: STATS_PASSWORD is not set');
  if (!(await authorized(request.headers.get('Authorization'), deps.password)))
    return text('Password needed.', 401, {
      'WWW-Authenticate': 'Basic realm="Subsola MCP stats", charset="UTF-8"',
    });
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return text('Method Not Allowed', 405, { Allow: 'GET, HEAD' });
  const range = rangeOf(new URL(request.url).searchParams.get('range'));
  const stats = await loadStats(deps.db, range, Math.floor(deps.now().getTime() / 1000));
  const nonce = newNonce();
  return new Response(request.method === 'HEAD' ? null : statsPage(stats, nonce), {
    status: 200,
    headers: statsPageHeaders(nonce),
  });
};
