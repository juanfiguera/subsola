import { describe, expect, it, vi } from 'vitest';
import { HEALTH_USER_AGENT, checkHealth } from './healthCheck';

const GOOD_ANSWER =
  'What public records show under the street at 117 West St. Records as of 2026-11-14.\nWater main...\nBefore any digging, call 811 at least 2 business days ahead.';

const initReply = {
  jsonrpc: '2.0',
  id: 1,
  result: { protocolVersion: '2025-06-18', serverInfo: { name: 'subsola', version: '1.2.1' } },
};
const toolReply = (text: string, isError = false) => ({
  jsonrpc: '2.0',
  id: 2,
  result: { content: [{ type: 'text', text }], isError },
});

/** A fake server: the first POST gets `init`, the second `tool`, each a Response or a throw. */
const server = (init: () => Response, tool: () => Response) => {
  const calls: RequestInit[] = [];
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, request?: RequestInit) => {
    calls.push(request ?? {});
    return calls.length === 1 ? init() : tool();
  });
  return { fetch: fetchMock as unknown as typeof fetch, calls };
};

/** A clock that moves `step` ms on each read. */
const clock = (step: number) => {
  let t = 1_000_000;
  return () => (t += step);
};

describe('checkHealth', () => {
  it('passes on a full answer, sending its User-Agent', async () => {
    const { fetch, calls } = server(
      () => Response.json(initReply),
      () => Response.json(toolReply(GOOD_ANSWER)),
    );
    const result = await checkHealth({ fetch, now: clock(100) });
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(calls).toHaveLength(2);
    expect((calls[0]!.headers as Record<string, string>)['User-Agent']).toBe(HEALTH_USER_AGENT);
    expect(JSON.parse(String(calls[1]!.body))).toMatchObject({
      method: 'tools/call',
      params: { name: 'whats_under', arguments: { address: '117 West St, New York, NY 10007' } },
    });
  });

  it('fails as unreachable when the server never answers', async () => {
    const { fetch } = server(
      () => {
        throw new DOMException('timed out', 'TimeoutError');
      },
      () => {
        throw new TypeError('fetch failed');
      },
    );
    const result = await checkHealth({ fetch, now: clock(10) });
    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.reason)).toEqual([
      'unreachable',
      'unreachable',
    ]);
    expect(result.failures[0]!.message).toBe('initialize: no answer within 20 s (TimeoutError)');
  });

  it('fails on a bad status without storing the body', async () => {
    const body = '<html>Error 1101 Worker threw exception at 1 Main St</html>';
    const { fetch } = server(
      () => new Response(body, { status: 503 }),
      () => Response.json(toolReply(GOOD_ANSWER)),
    );
    const result = await checkHealth({ fetch, now: clock(10) });
    expect(result.failures[0]).toMatchObject({
      reason: 'http_status',
      message: 'initialize: HTTP 503',
    });
    expect(result.failures[0]!.message).not.toContain('Main St');
  });

  it('fails on a reply that is not JSON, a JSON-RPC error and a bad initialize', async () => {
    expect(
      (
        await checkHealth({
          ...server(
            () => new Response('nope'),
            () => Response.json(toolReply(GOOD_ANSWER)),
          ),
          now: clock(10),
        })
      ).failures[0]?.reason,
    ).toBe('not_json');
    const rpcError = await checkHealth({
      ...server(
        () => Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'bad' } }),
        () => Response.json(toolReply(GOOD_ANSWER)),
      ),
      now: clock(10),
    });
    expect(rpcError.failures[0]).toMatchObject({
      reason: 'rpc_error',
      message: 'initialize: JSON-RPC error -32600',
    });
    const badInit = await checkHealth({
      ...server(
        () => Response.json({ jsonrpc: '2.0', id: 1, result: {} }),
        () => Response.json(toolReply(GOOD_ANSWER)),
      ),
      now: clock(10),
    });
    expect(badInit.failures.map((failure) => failure.reason)).toEqual(['bad_initialize']);
  });

  it('fails on a tool error, a missing marker or a slow answer', async () => {
    const run = (tool: () => Response, step = 10) =>
      checkHealth({ ...server(() => Response.json(initReply), tool), now: clock(step) });
    expect(
      (await run(() => Response.json(toolReply('Not found', true)))).failures.map((f) => f.reason),
    ).toEqual(['tool_error', 'no_records_date', 'no_811']);
    expect(
      (await run(() => Response.json(toolReply('Records as of today.')))).failures.map(
        (f) => f.reason,
      ),
    ).toEqual(['no_811']);
    const slow = await run(() => Response.json(toolReply(GOOD_ANSWER)), 11_000);
    expect(slow.failures.map((f) => f.reason)).toEqual(['slow']);
    expect(slow.failures[0]!.message).toMatch(/^whats_under: took \d+ ms, over 10000 ms$/);
  });
});
