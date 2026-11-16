import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleMcp, SUPPORTED_PROTOCOLS } from './protocol';
import { createIndexCache } from './lookup';
import type { ToolDeps } from './tools';

/**
 * Protocol 2026-07-28 beside the initialize era, the Origin check and the prompt. The wire shapes
 * follow https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
 * and /server/discover.
 */

const deps = (): ToolDeps => ({
  lookup: { cellsUrl: 'https://cells.test', cellIndex: createIndexCache('https://cells.test') },
  now: () => new Date('2026-11-08T17:00:00Z'),
});

const MODERN = '2026-07-28';

interface Reply {
  id: string | number | null;
  error?: { code: number; message: string; data?: { supported: string[]; requested: string } };
  result?: Record<string, unknown> & {
    resultType?: string;
    _meta?: Record<string, { name: string; version: string }>;
  };
}

/** A modern request: version in _meta and the three mirrored headers, unless overridden. */
const modern = async (
  method: string,
  params: Record<string, unknown> = {},
  {
    version = MODERN,
    headers = {},
  }: { version?: string; headers?: Record<string, string | null> } = {},
) => {
  const base: Record<string, string | null> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': version,
    'Mcp-Method': method,
    ...(typeof params.name === 'string' && { 'Mcp-Name': params.name }),
    ...headers,
  };
  const sent = Object.fromEntries(
    Object.entries(base).filter((entry): entry is [string, string] => entry[1] !== null),
  );
  const res = await handleMcp(
    new Request('https://subsola.com/mcp', {
      method: 'POST',
      headers: sent,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        method,
        params: {
          ...params,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': version,
            'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    }),
    deps(),
  );
  return { res, body: (await res.json()) as Reply };
};

afterEach(() => vi.unstubAllGlobals());

describe('protocol 2026-07-28', () => {
  it('answers server/discover with versions, capabilities, identity and cache hints', async () => {
    const { res, body } = await modern('server/discover');
    expect(res.status).toBe(200);
    expect(body.result).toMatchObject({
      resultType: 'complete',
      supportedVersions: SUPPORTED_PROTOCOLS,
      capabilities: { tools: {}, prompts: {} },
      ttlMs: expect.any(Number),
      cacheScope: 'public',
    });
    expect(body.result!.supportedVersions).toEqual(expect.arrayContaining([MODERN, '2025-11-25']));
    expect(body.result!._meta!['io.modelcontextprotocol/serverInfo']).toMatchObject({
      name: 'subsola',
      websiteUrl: 'https://subsola.com/mcp',
    });
    expect(String(body.result!.instructions)).toContain('811');
  });

  it('lists tools with resultType, cache hints and icons, and no initialize needed', async () => {
    const { body } = await modern('tools/list');
    expect(body.result).toMatchObject({ resultType: 'complete', cacheScope: 'public' });
    const tools = body.result!.tools as { name: string; icons?: unknown[] }[];
    expect(tools.map((tool) => tool.name)).toEqual(['whats_under', 'recent_digs']);
    expect(tools[0]!.icons?.length).toBeGreaterThan(0);
  });

  it('calls a tool, with bad arguments as a tool error carrying resultType', async () => {
    const { body } = await modern('tools/call', {
      name: 'recent_digs',
      arguments: { address: '1 Main St', radius_m: 5000 },
    });
    expect(body.result).toMatchObject({ resultType: 'complete', isError: true });
  });

  it('turns down a version it does not speak with the supported list', async () => {
    const { res, body } = await modern('tools/list', {}, { version: '2031-01-01' });
    expect(res.status).toBe(400);
    expect(body.error).toMatchObject({
      code: -32022,
      data: { supported: SUPPORTED_PROTOCOLS, requested: '2031-01-01' },
    });
  });

  it.each([
    ['a missing version header', { 'MCP-Protocol-Version': null }],
    ['a version header that disagrees', { 'MCP-Protocol-Version': '2025-11-25' }],
    ['a missing Mcp-Method', { 'Mcp-Method': null }],
    ['an Mcp-Method that disagrees', { 'Mcp-Method': 'tools/call' }],
  ])('answers %s with 400 HeaderMismatch', async (_, headers) => {
    const { res, body } = await modern('tools/list', {}, { headers });
    expect(res.status).toBe(400);
    expect(body.error!.code).toBe(-32020);
  });

  it('holds Mcp-Name to the tool called, reading the base64 form', async () => {
    const wrong = await modern(
      'tools/call',
      { name: 'whats_under', arguments: {} },
      { headers: { 'Mcp-Name': 'recent_digs' } },
    );
    expect(wrong.res.status).toBe(400);
    expect(wrong.body.error!.code).toBe(-32020);
    const missing = await modern(
      'tools/call',
      { name: 'whats_under', arguments: {} },
      { headers: { 'Mcp-Name': null } },
    );
    expect(missing.body.error!.code).toBe(-32020);
    const encoded = await modern(
      'tools/call',
      { name: 'whats_under', arguments: {} },
      { headers: { 'Mcp-Name': `=?base64?${btoa('whats_under')}?=` } },
    );
    expect(encoded.res.status).toBe(200);
    expect(encoded.body.result).toMatchObject({ isError: true });
  });

  it('answers an unknown method, ping included, with 404 and -32601', async () => {
    for (const method of ['resources/list', 'ping']) {
      const { res, body } = await modern(method);
      expect(res.status, method).toBe(404);
      expect(body.error!.code).toBe(-32601);
    }
  });

  it('keeps an initialize-era client working beside it', async () => {
    const res = await handleMcp(
      new Request('https://subsola.com/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'MCP-Protocol-Version': '2025-06-18' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
      deps(),
    );
    const body = (await res.json()) as Reply;
    expect(res.status).toBe(200);
    expect(body.result).not.toHaveProperty('resultType');
    // 2025-06-18 predates tool icons.
    expect(JSON.stringify(body.result)).not.toContain('icons');
  });

  it('tells a legacy request that claims the modern version what is missing', async () => {
    const res = await handleMcp(
      new Request('https://subsola.com/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'MCP-Protocol-Version': MODERN },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
      deps(),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as Reply).error!.code).toBe(-32020);
  });
});

describe('Origin', () => {
  const withOrigin = (origin: string) =>
    handleMcp(
      new Request('https://subsola.com/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      }),
      deps(),
    );

  it.each([
    'https://claude.ai',
    'https://example.com',
    'http://localhost:6274',
    'http://127.0.0.1:3000',
    'null',
    'vscode-file://vscode-app',
    'app://obsidian.md',
    'tauri://localhost',
  ])('accepts %s', async (origin) => {
    expect((await withOrigin(origin)).status).toBe(200);
  });

  it.each(['http://evil.example', 'http://192.168.1.20:8080', 'not a url'])(
    'turns away %s with 403',
    async (origin) => {
      const res = await withOrigin(origin);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ id: null, error: { code: -32600 } });
    },
  );
});

describe('check_before_digging prompt', () => {
  const legacy = (method: string, params?: Record<string, unknown>) =>
    handleMcp(
      new Request('https://subsola.com/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'MCP-Protocol-Version': '2025-11-25' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      }),
      deps(),
    ).then(async (res) => (await res.json()) as Reply);

  it('is listed with its address argument', async () => {
    const body = await legacy('prompts/list');
    expect(body.result!.prompts).toMatchObject([
      { name: 'check_before_digging', arguments: [{ name: 'address', required: true }] },
    ]);
  });

  it('asks for both tools and the 811 reminder for the address given', async () => {
    const body = await legacy('prompts/get', {
      name: 'check_before_digging',
      arguments: { address: '1420 5th Ave, Seattle' },
    });
    const text = JSON.stringify(body.result);
    for (const part of ['1420 5th Ave, Seattle', 'whats_under', 'recent_digs', '811'])
      expect(text).toContain(part);
  });

  it('turns down a missing address or an unknown prompt as invalid params', async () => {
    expect((await legacy('prompts/get', { name: 'check_before_digging' })).error!.code).toBe(
      -32602,
    );
    expect((await legacy('prompts/get', { name: 'nope', arguments: {} })).error!.code).toBe(-32602);
  });

  it('works the same over 2026-07-28', async () => {
    const { body } = await modern('prompts/get', {
      name: 'check_before_digging',
      arguments: { address: '1437 Bannock St, Denver' },
    });
    expect(body.result).toMatchObject({ resultType: 'complete' });
    expect(JSON.stringify(body.result)).toContain('1437 Bannock St, Denver');
  });
});
