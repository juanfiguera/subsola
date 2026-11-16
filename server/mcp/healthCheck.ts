/**
 * The health check of https://subsola.com/mcp: connect, then ask one real question. Shared by the
 * scheduled Worker (workers/health) and the by-hand script (.github/scripts/mcp-health.mjs), which
 * Node runs straight from this file, so it imports nothing and uses only erasable TypeScript.
 *
 * Its User-Agent marks its calls as "subsola-health", which /mcp/stats leaves out of every figure.
 */

export const HEALTH_URL = 'https://subsola.com/mcp';
export const HEALTH_ADDRESS = '117 West St, New York, NY 10007';
export const HEALTH_USER_AGENT = 'subsola-health/1';
export const SLOW_MS = 10_000;
// Past this a request is cut off; anything slower than SLOW_MS already fails.
const TIMEOUT_MS = 20_000;
const PROTOCOL = '2025-06-18';
// Stored messages stay short; the console may show more.
const MESSAGE_MAX = 160;

/** Why a run failed, as a short code, with the words the stats page and the alert use. */
export const FAILURE_NOTES = {
  unreachable: 'no answer from subsola.com/mcp',
  http_status: 'an HTTP status other than 200',
  not_json: 'a reply that is not JSON',
  rpc_error: 'a JSON-RPC error',
  bad_initialize: 'initialize returned no server info',
  tool_error: 'the tool returned an error',
  no_records_date: 'the answer has no "Records as of" date',
  no_811: 'the answer has no 811 line',
  slow: 'the tool call took over 10 seconds',
} as const;

export type FailureReason = keyof typeof FAILURE_NOTES;

export interface Failure {
  reason: FailureReason;
  /** One short line, safe to store: never a response body. */
  message: string;
  /** For the console only: may quote a little of the reply. */
  detail?: string;
}

export interface CheckResult {
  ok: boolean;
  /** The whole run, from the first request to the last reply. */
  durationMs: number;
  /** In order; the first is the one stored and alerted on. */
  failures: Failure[];
  /** What happened, a line per step, for the console. */
  log: string[];
}

export interface CheckOptions {
  url?: string;
  address?: string;
  fetch?: typeof fetch;
  now?: () => number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const short = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, MESSAGE_MAX);

export const checkHealth = async (options: CheckOptions = {}): Promise<CheckResult> => {
  const url = options.url ?? HEALTH_URL;
  const address = options.address ?? HEALTH_ADDRESS;
  const send = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const failures: Failure[] = [];
  const log: string[] = [];
  const fail = (failure: Failure) => {
    failures.push({ ...failure, message: short(failure.message) });
  };

  /** One JSON-RPC call: the reply's result and how long it took, or null after failing. */
  const rpc = async (
    label: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<{ result: Record<string, unknown>; ms: number } | null> => {
    const started = now();
    let response: Response;
    try {
      response = await send(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'User-Agent': HEALTH_USER_AGENT,
          ...headers,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : 'error';
      fail({
        reason: 'unreachable',
        message: `${label}: no answer within ${TIMEOUT_MS / 1000} s (${name})`,
      });
      return null;
    }
    const text = await response.text();
    const ms = now() - started;
    log.push(`${label}: HTTP ${response.status} in ${ms} ms`);
    if (response.status !== 200) {
      fail({
        reason: 'http_status',
        message: `${label}: HTTP ${response.status}`,
        detail: text.slice(0, 300),
      });
      return null;
    }
    let reply: unknown;
    try {
      reply = JSON.parse(text);
    } catch {
      fail({
        reason: 'not_json',
        message: `${label}: the reply isn't JSON`,
        detail: text.slice(0, 300),
      });
      return null;
    }
    if (!isRecord(reply)) {
      fail({ reason: 'not_json', message: `${label}: the reply isn't a JSON-RPC object` });
      return null;
    }
    if (reply.error !== undefined) {
      const code = isRecord(reply.error) ? reply.error.code : undefined;
      const message = isRecord(reply.error) ? reply.error.message : undefined;
      fail({
        reason: 'rpc_error',
        message: `${label}: JSON-RPC error ${typeof code === 'number' ? code : '?'}`,
        detail: typeof message === 'string' ? message.slice(0, 300) : undefined,
      });
      return null;
    }
    return { result: isRecord(reply.result) ? reply.result : {}, ms };
  };

  const started = now();
  const init = await rpc('initialize', {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: 'subsola-health', version: '1' },
    },
  });
  if (init) {
    const { protocolVersion, serverInfo } = init.result;
    if (typeof protocolVersion !== 'string' || !isRecord(serverInfo) || !serverInfo.name)
      fail({
        reason: 'bad_initialize',
        message: 'initialize: the result has no protocolVersion or serverInfo',
      });
    else
      log.push(
        `initialize: ${String(serverInfo.name)} ${String(serverInfo.version)}, protocol ${protocolVersion}`,
      );
  }

  const call = await rpc(
    'whats_under',
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'whats_under', arguments: { address } },
    },
    { 'MCP-Protocol-Version': PROTOCOL },
  );
  if (call) {
    const content = Array.isArray(call.result.content) ? call.result.content : [];
    const text = content
      .map((part: unknown) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
      .join('\n');
    if (call.result.isError)
      fail({
        reason: 'tool_error',
        message: 'whats_under: a tool error',
        detail: text.slice(0, 300),
      });
    if (!text.includes('Records as of'))
      fail({
        reason: 'no_records_date',
        message: 'whats_under: the answer has no "Records as of" date',
      });
    if (!/Before any digging[^\n]*811/.test(text))
      fail({ reason: 'no_811', message: 'whats_under: the answer has no 811 line' });
    if (call.ms > SLOW_MS)
      fail({ reason: 'slow', message: `whats_under: took ${call.ms} ms, over ${SLOW_MS} ms` });
    log.push(`whats_under: ${text.split('\n')[0] ?? ''}`);
  }

  return { ok: failures.length === 0, durationMs: Math.max(0, now() - started), failures, log };
};
