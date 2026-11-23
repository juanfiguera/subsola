import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Feature, Geometry, Position } from 'geojson';
import { handleMcp, LATEST_LEGACY_PROTOCOL, type McpDeps } from './protocol';
import type { CallRecord } from './calls';
import { saveCall } from './callLog';
import { requesterId, requesterOf } from './requester';
import { createIndexCache } from './lookup';
import { recentDigsOutput, whatsUnderOutput } from './answers';
import type { ToolDeps } from './tools';
import { gridCellOf } from '../../src/grid';
import { createFrame } from '../../src/scene/local';
import {
  permitGroupFeature,
  type PermitGroupProperties,
  type PermitRecord,
} from '../../src/sources/permits';

const CELLS = 'https://cells.test';
// 1420 5th Ave, Seattle.
const ADDRESS: Position = [-122.3352, 47.6106];
const TODAY = new Date('2026-11-08T17:00:00Z');

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://subsola.com/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const rpc = (method: string, params?: Record<string, unknown>, id: number | string = 1) => ({
  jsonrpc: '2.0',
  id,
  method,
  ...(params ? { params } : {}),
});

const deps = (): ToolDeps => ({
  lookup: { cellsUrl: CELLS, cellIndex: createIndexCache(CELLS) },
  now: () => TODAY,
});

interface ListedTool {
  name: string;
  description: string;
  annotations: Record<string, unknown>;
  inputSchema: {
    type: string;
    required: string[];
    properties: Record<string, Record<string, unknown>>;
    $schema?: string;
  };
  outputSchema: { type: string };
}

/** The reply fields these tests read; the schemas and toMatchObject check the rest. */
interface Reply {
  jsonrpc: '2.0';
  id: string | number | null;
  error?: { code: number; message: string };
  result: {
    protocolVersion?: string;
    instructions?: string;
    tools?: ListedTool[];
    content: { type: 'text'; text: string }[];
    structuredContent?: unknown;
    isError?: boolean;
  };
}

const call = async (body: unknown, headers?: Record<string, string>) => {
  const res = await handleMcp(post(body, headers), deps());
  return { res, body: res.status === 202 ? null : ((await res.json()) as Reply) };
};

const record = (overrides: Partial<PermitRecord>): PermitRecord => ({
  permitNumber: 'SUUTIL0001',
  utility: 'gas',
  type: 'Utility Infrastructure',
  permittee: 'Puget Sound Energy',
  issued: '2026-10-01',
  workStart: '2026-10-15',
  workEnd: '2026-12-15',
  status: undefined,
  street: '5TH AVE   between UNION ST and PIKE ST',
  purpose: undefined,
  locationNote: undefined,
  mentionsMain: false,
  dataset: 'seaPermits',
  ...overrides,
});

// A block running north-south 8 m east of the address, in degrees.
const blockBeside = (): Geometry => {
  const frame = createFrame(ADDRESS);
  return { type: 'LineString', coordinates: [frame.toLngLat([8, -60]), frame.toLngLat([8, 60])] };
};

const groups = (): Feature<Geometry, PermitGroupProperties>[] => [
  permitGroupFeature('gas|5th', blockBeside(), [
    record({}),
    record({
      permitNumber: 'SUUTIL0002',
      issued: '2019-03-02',
      workStart: '2019-03-05',
      workEnd: '2019-04-01',
    }),
    // Opens a manhole, not the street.
    record({ permitNumber: 'SUUTIL0003', issued: '2026-11-01', noOpening: true }),
  ]),
];

/** The Seattle locator, the build's index and one cell, as the network would answer. */
const stubNetwork = () => {
  const cell = gridCellOf(ADDRESS);
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('gismaps.kingcounty.gov'))
      return Response.json({
        candidates: [
          {
            score: 100,
            location: { x: ADDRESS[0], y: ADDRESS[1] },
            attributes: { StAddr: '1420 5TH AVE', City: 'Seattle' },
          },
        ],
      });
    if (url === `${CELLS}/index.json`)
      return Response.json({ v: 1, builtAt: '2026-11-08T21:27:04.374Z', cells: { [cell.key]: 1 } });
    if (url === `${CELLS}/${cell.key}.json.gz`)
      return Response.json({ v: 1, key: cell.key, permitGroups: groups() });
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('handleMcp transport', () => {
  it('answers a CORS preflight from any origin', async () => {
    const res = await handleMcp(
      new Request('https://subsola.com/mcp', {
        method: 'OPTIONS',
        headers: { Origin: 'https://claude.ai' },
      }),
      deps(),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('MCP-Protocol-Version');
  });

  it.each(['GET', 'DELETE', 'PUT'])(
    'turns down %s with 405, since there is no stream or session',
    async (method) => {
      const res = await handleMcp(new Request('https://subsola.com/mcp', { method }), deps());
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('POST, OPTIONS');
    },
  );

  const BROWSER_ACCEPT =
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
  const get = (accept: string) =>
    handleMcp(
      new Request('https://subsola.com/mcp', { method: 'GET', headers: { Accept: accept } }),
      deps(),
    );

  it('shows a browser a page about the server', async () => {
    const res = await get(BROWSER_ACCEPT);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('Vary')).toBe('Accept');
    const html = await res.text();
    for (const text of [
      'whats_under',
      'recent_digs',
      'Seattle',
      '811',
      '30 questions a minute and 600 a day',
      'claude mcp add --transport http subsola https://subsola.com/mcp',
      'Streamable HTTP',
      'href="/insights"',
    ])
      expect(html).toContain(text);
  });

  it("lets only the page's own nonce run its inline style and script", async () => {
    const res = await get(BROWSER_ACCEPT);
    const policy = res.headers.get('Content-Security-Policy') ?? '';
    const nonce = /script-src 'nonce-([^']+)'/.exec(policy)?.[1];
    expect(nonce).toBeTruthy();
    expect(policy).not.toContain('unsafe-inline');
    expect(policy).toContain("frame-ancestors 'none'");
    // Only same-origin connections, for Cloudflare Web Analytics' /cdn-cgi/rum.
    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toMatch(/connect-src[^;]*https?:/);
    const html = await res.text();
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html).toContain(`<style nonce="${nonce}">`);
    // A new nonce every time, or it would be no better than a fixed allowance.
    const again = (await get(BROWSER_ACCEPT)).headers.get('Content-Security-Policy');
    expect(again).not.toBe(policy);
  });

  it.each([
    ['an MCP client opening a stream', 'text/event-stream'],
    ['a client asking for a stream or HTML', 'text/html, text/event-stream'],
    ['curl and fetch', '*/*'],
    ['a client that prefers JSON', 'application/json, text/html;q=0.5'],
    ['no Accept at all', ''],
  ])('still turns down a GET from %s with 405', async (_who, accept) => {
    const res = await get(accept);
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST, OPTIONS');
  });

  it('answers a POST the same whatever its Accept header says', async () => {
    const { res, body } = await call(rpc('ping'), { Accept: BROWSER_ACCEPT });
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ jsonrpc: '2.0', id: 1, result: {} });
  });

  it('returns a parse error for a body that is not JSON', async () => {
    const { res, body } = await call('{not json');
    expect(res.status).toBe(400);
    expect(body).toMatchObject({ jsonrpc: '2.0', id: null, error: { code: -32700 } });
  });

  it('turns down an oversized body as unparseable', async () => {
    const { res } = await call(rpc('ping', { padding: 'x'.repeat(20_000) }));
    expect(res.status).toBe(400);
  });

  it('turns down batches and messages that are not JSON-RPC 2.0', async () => {
    expect((await call([rpc('ping')])).body).toMatchObject({ error: { code: -32600 } });
    expect((await call({ jsonrpc: '1.0', id: 1, method: 'ping' })).body).toMatchObject({
      error: { code: -32600 },
    });
    expect((await call({ jsonrpc: '2.0', id: 1 })).res.status).toBe(400);
  });

  it('accepts notifications with 202 and no body', async () => {
    const res = await handleMcp(
      post({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      deps(),
    );
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });

  it('sends JSON with no-store and CORS on every reply', async () => {
    const { res } = await call(rpc('ping'));
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('handleMcp methods', () => {
  it('initializes with the latest version, the tools capability and no session', async () => {
    const { res, body } = await call(
      rpc('initialize', {
        protocolVersion: LATEST_LEGACY_PROTOCOL,
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      }),
    );
    expect(res.headers.get('Mcp-Session-Id')).toBeNull();
    expect(body).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-11-25',
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: {
          name: 'subsola',
          version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
          websiteUrl: 'https://subsola.com/mcp',
          icons: expect.arrayContaining([expect.objectContaining({ mimeType: 'image/svg+xml' })]),
        },
      },
    });
    expect(body!.result.instructions).toContain('811');
    // Instructions describe the server; they don't tell the assistant what to do.
    expect(body!.result.instructions).not.toMatch(/\b(always|must|never)\b/i);
  });

  it('keeps an older version the client asks for, and offers the latest for an unknown one', async () => {
    const older = await call(
      rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {} }),
    );
    expect(older.body!.result.protocolVersion).toBe('2024-11-05');
    // 2024-11-05 predates icons and the server description.
    expect(older.body!.result).toMatchObject({ serverInfo: { name: 'subsola' } });
    expect(JSON.stringify(older.body!.result)).not.toContain('icons');
    const unknown = await call(
      rpc('initialize', { protocolVersion: '2031-01-01', capabilities: {} }),
    );
    expect(unknown.body!.result.protocolVersion).toBe(LATEST_LEGACY_PROTOCOL);
  });

  it('answers ping with an empty result', async () => {
    expect((await call(rpc('ping', undefined, 'p1'))).body).toEqual({
      jsonrpc: '2.0',
      id: 'p1',
      result: {},
    });
  });

  it('refuses a protocol version header it never offered', async () => {
    const { res, body } = await call(rpc('tools/list'), { 'MCP-Protocol-Version': '1999-01-01' });
    expect(res.status).toBe(400);
    expect(body).toMatchObject({ error: { code: -32600 } });
  });

  it('lists exactly the two tools, read-only, with input and output schemas', async () => {
    const { body } = await call(rpc('tools/list'), {
      'MCP-Protocol-Version': LATEST_LEGACY_PROTOCOL,
    });
    const tools = body!.result.tools!;
    expect(tools.map((tool) => tool.name)).toEqual(['whats_under', 'recent_digs']);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(100);
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
      expect(tool).toHaveProperty('icons');
      expect(tool.inputSchema).toMatchObject({ type: 'object', required: ['address'] });
      expect(tool.inputSchema.properties.address?.maxLength).toBe(200);
      expect(tool.outputSchema.type).toBe('object');
      expect(tool.inputSchema.$schema).toBeUndefined();
    }
    expect(tools[1]!.inputSchema.properties.radius_m).toMatchObject({ default: 150, maximum: 400 });
    // city takes full names, so it is a string whose description lists the ids.
    for (const tool of tools) {
      const city = tool.inputSchema.properties.city!;
      expect(city.type).toBe('string');
      expect(city.description).toContain('"la" for Los Angeles');
      expect(city.description).toContain('full name');
      expect(city.examples).toEqual([
        'nyc',
        'dc',
        'sf',
        'la',
        'sd',
        'sea',
        'den',
        'chi',
        'dal',
        'sj',
      ]);
    }
  });

  it('answers an unknown method with method not found', async () => {
    expect((await call(rpc('resources/list'))).body).toMatchObject({ error: { code: -32601 } });
  });
});

describe('handleMcp tools/call', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('tells the assistant to wait when the caller is over the limit, without looking anything up', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await handleMcp(
      post(rpc('tools/call', { name: 'whats_under', arguments: { address: '1 Main St' } })),
      { ...deps(), limit: async () => 42 },
    );
    const body = (await res.json()) as Reply;
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0]!.text).toContain('Try again in 42 seconds');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    // Connecting and listing tools are never counted.
    let limited = 0;
    await handleMcp(post(rpc('tools/list')), { ...deps(), limit: async () => (limited++, 42) });
    expect(limited).toBe(0);
  });

  it('keeps an unknown tool a protocol error', async () => {
    expect((await call(rpc('tools/call', { name: 'dig_here', arguments: {} }))).body).toMatchObject(
      { error: { code: -32602, message: 'Unknown tool: dig_here' } },
    );
  });

  it.each([
    [
      { name: 'recent_digs', arguments: { address: '1 Main St', radius_m: 5000 } },
      'Invalid arguments for recent_digs: radius_m must be between 10 and 400 (got 5000). Try 400.',
    ],
    [
      { name: 'recent_digs', arguments: { address: '1 Main St', radius_m: 12.5 } },
      'radius_m must be a whole number (got 12.5).',
    ],
    [
      { name: 'whats_under', arguments: { address: 'x'.repeat(201) } },
      'address can be at most 200 characters (got 201).',
    ],
    [{ name: 'whats_under', arguments: {} }, 'address is required.'],
    [{ name: 'whats_under', arguments: { address: '' } }, "address can't be empty."],
    [
      { name: 'whats_under', arguments: { address: '1 Main St', city: 'boston' } },
      'city: "boston" isn\'t a city Subsola covers. Use one of "nyc" (New York City), "dc" (Washington, DC)',
    ],
    [
      { name: 'recent_digs', arguments: { address: '1 Main St', city: 'Gotham' } },
      'full names like "Los Angeles" work too.',
    ],
    [
      { name: 'recent_digs', arguments: { address: '1 Main St', city: 7 } },
      'city must be a string (got a number: 7).',
    ],
    [
      { name: 'recent_digs', arguments: { address: '1 Main St', permitted_today: 'yes' } },
      'permitted_today must be a boolean (got a string: "yes").',
    ],
  ])('answers bad arguments as a tool error the model can fix: %j', async (params, text) => {
    const { body } = await call(rpc('tools/call', params));
    expect(body!.error).toBeUndefined();
    expect(body!.result.isError).toBe(true);
    expect(body!.result.content[0]!.text).toContain(text);
  });

  it('answers whats_under from the geocoder and the cells, ending with 811 and a map link', async () => {
    const fetchMock = stubNetwork();
    const { body } = await call(
      rpc('tools/call', { name: 'whats_under', arguments: { address: '1420 5th Ave, Seattle' } }),
    );
    const result = body!.result;
    expect(result.isError).toBeUndefined();
    const structured = whatsUnderOutput.parse(result.structuredContent);
    expect(structured.city).toBe('Seattle');
    const gas = structured.utilities.find((main) => main.utility === 'gas');
    expect(gas).toMatchObject({
      placement: 'permits',
      confidence: 'From permits',
      permitsOnBlock: 2,
    });
    expect(gas!.depth.standard).not.toBeNull();
    expect(structured.permittedToday).toEqual([
      expect.objectContaining({ permitNumber: 'SUUTIL0001', permittee: 'Puget Sound Energy' }),
    ]);
    const text: string = result.content[0]!.text;
    expect(text).toContain('not a substitute for calling 811');
    expect(text).toContain('https://washington811.com/');
    expect(text.trim().split('\n').at(-2)).toBe(
      'See this spot on Subsola: https://subsola.com/?q=1420%205th%20Ave%2C%20Seattle%2C%20WA',
    );
    expect(text.trim().split('\n').at(-1)).toContain('Data credits: Records from City of Seattle');
    // The address goes to the geocoder and nowhere else.
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.filter((url) => url.includes('5th'))).toHaveLength(1);
  });

  it('answers recent_digs newest first, leaving out permits that do not open the street', async () => {
    stubNetwork();
    const { body } = await call(
      rpc('tools/call', {
        name: 'recent_digs',
        arguments: { address: '1420 5th Ave, Seattle', radius_m: 100 },
      }),
    );
    const structured = recentDigsOutput.parse(body!.result.structuredContent);
    expect(structured.digs.map((dig) => dig.permitNumber)).toEqual(['SUUTIL0001', 'SUUTIL0002']);
    expect(structured.digs[0]).toMatchObject({
      permittedToday: true,
      street: '5TH AVE between UNION ST and PIKE ST',
    });
    expect(structured.digs[1]!.permittedToday).toBe(false);
    expect(body!.result.content[0]!.text).toContain('https://washington811.com/');
  });

  it('reports an address it cannot find as a tool error naming the cities covered', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ candidates: [], features: [] })),
    );
    const { body } = await call(
      rpc('tools/call', { name: 'whats_under', arguments: { address: '10 Downing St, London' } }),
    );
    expect(body!.result.isError).toBe(true);
    const text: string = body!.result.content[0]!.text;
    expect(text).toContain('"London" isn\'t one of the cities Subsola covers');
    expect(text).toContain('set the city input');
    expect(text).toContain('Seattle');
    expect(text).toContain('811');
  });

  it('turns an address in another state into a miss, not a New York lookalike', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('geosearch')
          ? Response.json({
              features: [
                {
                  geometry: { coordinates: [-73.99, 40.7] },
                  properties: {
                    label: '1 Main St, Brooklyn, NY',
                    street: 'MAIN STREET',
                    borough: 'Brooklyn',
                  },
                },
              ],
            })
          : Response.json({ candidates: [] }),
      ),
    );
    const { body } = await call(
      rpc('tools/call', { name: 'whats_under', arguments: { address: '1 Main St, Boston, MA' } }),
    );
    expect(body!.result.isError).toBe(true);
  });

  it('turns "100 Main St, Boston" into a miss naming the lookalike, not a Bronx report', async () => {
    // What GeoSearch really answered on 2026-11-11.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('geosearch')
          ? Response.json({
              features: [
                {
                  geometry: { coordinates: [-73.8303, 40.8431] },
                  properties: {
                    label: '190C MAIN STREET, Bronx, NY, USA',
                    street: 'MAIN STREET',
                    borough: 'Bronx',
                  },
                },
              ],
            })
          : Response.json({ candidates: [], features: [] }),
      ),
    );
    for (const address of ['100 Main St, Boston', '100 Main St']) {
      const { body } = await call(
        rpc('tools/call', { name: 'whats_under', arguments: { address } }),
      );
      expect(body!.result.isError, address).toBe(true);
      expect(body!.result.structuredContent).toBeUndefined();
      const text = body!.result.content[0]!.text;
      expect(text).toContain(address.includes('Boston') ? '"Boston"' : 'different house number');
      expect(text).toContain('New York City');
    }
  });

  it('says when the match differs from the address asked for', async () => {
    stubNetwork();
    const { body } = await call(
      rpc('tools/call', {
        name: 'whats_under',
        arguments: { address: '1420-24 5th Ave, Seattle', city: 'sea' },
      }),
    );
    expect(body!.result.isError).toBeUndefined();
    expect(body!.result.content[0]!.text.split('\n')[0]).toBe(
      'Matched to 1420 5th Ave, Seattle, WA (you asked for 1420-24 5th Ave, Seattle).',
    );
    expect(body!.result.structuredContent).toMatchObject({
      requestedAddress: '1420-24 5th Ave, Seattle',
      matchedAddress: '1420 5th Ave, Seattle, WA',
      matchDiffers: true,
    });
  });

  it.each(['sea', 'Seattle', ' SEATTLE. '])(
    'reads the city input %j as Seattle and asks only its geocoder',
    async (city) => {
      const fetchMock = stubNetwork();
      const { body } = await call(
        rpc('tools/call', {
          name: 'recent_digs',
          arguments: { address: '1420 5th Ave, Seattle', city },
        }),
      );
      expect(body!.result.isError).toBeUndefined();
      expect(body!.result.structuredContent).toMatchObject({ city: 'Seattle' });
      const hosts = fetchMock.mock.calls.map(([url]) => new URL(String(url)).host);
      expect(hosts).not.toContain('geosearch.planninglabs.nyc');
    },
  );

  it('asks only the city given and calls a conflicting place an error', async () => {
    const fetchMock = stubNetwork();
    const { body } = await call(
      rpc('tools/call', {
        name: 'whats_under',
        arguments: { address: '1420 5th Ave, Seattle', city: 'sea' },
      }),
    );
    expect(body!.result.structuredContent).toMatchObject({ matchDiffers: false });
    expect(body!.result.content[0]!.text).not.toContain('Matched to');
    const hosts = fetchMock.mock.calls.map(([url]) => new URL(String(url)).host);
    expect(hosts).not.toContain('geosearch.planninglabs.nyc');

    const conflict = await call(
      rpc('tools/call', {
        name: 'whats_under',
        arguments: { address: '6000 Hollywood Blvd, Hollywood', city: 'New York City' },
      }),
    );
    expect(conflict.body!.result.isError).toBe(true);
    expect(conflict.body!.result.content[0]!.text).toContain(
      '"Hollywood" is in Los Angeles, but the city input says New York City',
    );
  });

  it('says the data is unavailable when the bucket is down, without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('kingcounty')
          ? Response.json({
              candidates: [
                {
                  score: 100,
                  location: { x: ADDRESS[0], y: ADDRESS[1] },
                  attributes: { StAddr: '1420 5TH AVE', City: 'Seattle' },
                },
              ],
            })
          : new Response('down', { status: 503 }),
      ),
    );
    const { body } = await call(
      rpc('tools/call', { name: 'recent_digs', arguments: { address: '1420 5th Ave, Seattle' } }),
    );
    expect(body!.result.isError).toBe(true);
    expect(body!.result.content[0]!.text).toContain("couldn't be loaded");
  });
});

describe('createIndexCache', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the index once per 5 minutes', async () => {
    const fetchMock = vi.fn(async () => Response.json({ v: 1, builtAt: 'x', cells: {} }));
    vi.stubGlobal('fetch', fetchMock);
    let now = 0;
    const index = createIndexCache(CELLS, () => now);
    await index();
    now = 4 * 60_000;
    await index();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now = 6 * 60_000;
    await index();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('forgets a failed fetch so the next question tries again', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ v: 1, builtAt: 'x', cells: {} }));
    vi.stubGlobal('fetch', fetchMock);
    const index = createIndexCache(CELLS, () => 0);
    await expect(index()).rejects.toThrow();
    await expect(index()).resolves.toMatchObject({ builtAt: 'x' });
  });
});

describe('handleMcp stats rows', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Sends one request and returns the stats rows it produced. */
  const rowsFor = async (
    body: unknown,
    headers: Record<string, string> = {},
    extra: Partial<McpDeps> = {},
  ) => {
    const rows: CallRecord[] = [];
    await handleMcp(post(body, headers), {
      ...deps(),
      record: (row) => rows.push(row),
      ...extra,
    });
    return rows;
  };
  const whatsUnder = (address: string) =>
    rpc('tools/call', { name: 'whats_under', arguments: { address } });

  it('records an answer with its tool, city, timing and client family', async () => {
    stubNetwork();
    const [row, ...more] = await rowsFor(whatsUnder('1420 5th Ave, Seattle'), {
      'User-Agent': 'claude-code/2.1.0 (cli; node 22)',
      'MCP-Protocol-Version': LATEST_LEGACY_PROTOCOL,
    });
    expect(more).toHaveLength(0);
    expect(row).toMatchObject({
      method: 'tools/call',
      tool: 'whats_under',
      region: 'sea',
      outcome: 'answered',
      client: 'claude',
      protocol: LATEST_LEGACY_PROTOCOL,
      missedPlace: null,
    });
    expect(row!.durationMs).toBeGreaterThanOrEqual(0);
    expect(row!.at).toBeGreaterThan(1_700_000_000);
    // Nothing typed reaches the row.
    expect(JSON.stringify(row)).not.toMatch(/1420|5th|claude-code/i);
  });

  it('records "100 Main St, Boston" as outside coverage, naming Boston from its own list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('geosearch')
          ? Response.json({
              features: [
                {
                  geometry: { coordinates: [-73.8303, 40.8431] },
                  properties: {
                    label: '190C MAIN STREET, Bronx, NY, USA',
                    street: 'MAIN STREET',
                    borough: 'Bronx',
                  },
                },
              ],
            })
          : Response.json({ candidates: [], features: [] }),
      ),
    );
    const [boston] = await rowsFor(whatsUnder('100 Main St, Boston'));
    expect(boston).toMatchObject({
      outcome: 'outside_coverage',
      missedPlace: 'Boston, MA',
      region: null,
    });
    // A miss in a covered city is no_match, with no place stored.
    const [bronx] = await rowsFor(whatsUnder('100 Main St'));
    expect(bronx).toMatchObject({ outcome: 'no_match', missedPlace: null });
  });

  it('records a place it does not know as outside coverage with no place stored', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ candidates: [], features: [] })),
    );
    const [row] = await rowsFor(whatsUnder('10 Downing St, London'));
    expect(row).toMatchObject({ outcome: 'outside_coverage', missedPlace: null });
  });

  it('records bad arguments, unknown tools, the rate limit and a server error', async () => {
    expect(
      (await rowsFor(rpc('tools/call', { name: 'recent_digs', arguments: { radius_m: 5 } })))[0],
    ).toMatchObject({ outcome: 'bad_args', tool: 'recent_digs' });
    // A tool name the server doesn't have is never stored.
    expect(
      (await rowsFor(rpc('tools/call', { name: '1 Main St Boston', arguments: {} })))[0],
    ).toMatchObject({ outcome: 'bad_args', tool: null });
    expect(
      (await rowsFor(whatsUnder('1 Main St'), {}, { limit: async () => 30 }))[0],
    ).toMatchObject({ outcome: 'rate_limited', tool: 'whats_under' });
    stubNetwork();
    const [thrown] = await rowsFor(
      rpc('tools/call', {
        name: 'recent_digs',
        arguments: { address: '1420 5th Ave, Seattle' },
      }),
      {},
      {
        now: () => {
          throw new Error('clock');
        },
      },
    );
    expect(thrown).toMatchObject({ outcome: 'server_error', tool: 'recent_digs' });
  });

  it('records a failed upstream as upstream_error, with the city it was found in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('kingcounty')
          ? Response.json({
              candidates: [
                {
                  score: 100,
                  location: { x: ADDRESS[0], y: ADDRESS[1] },
                  attributes: { StAddr: '1420 5TH AVE', City: 'Seattle' },
                },
              ],
            })
          : new Response('down', { status: 503 }),
      ),
    );
    const [row] = await rowsFor(whatsUnder('1420 5th Ave, Seattle'));
    expect(row).toMatchObject({ outcome: 'upstream_error', region: 'sea' });
  });

  it("labels initialize with the app's family, and the health check whatever it sends", async () => {
    const init = (name: string) =>
      rpc('initialize', {
        protocolVersion: '2025-06-18',
        clientInfo: { name, version: '1.0' },
        capabilities: {},
      });
    expect((await rowsFor(init('Visual Studio Code')))[0]).toMatchObject({
      method: 'initialize',
      outcome: 'answered',
      client: 'vscode',
      protocol: '2025-06-18',
    });
    // Any name outside the known families falls back to the User-Agent family.
    expect(
      (await rowsFor(init('1 Main St, Boston, call 617-555-0100'), { 'User-Agent': 'curl/8' }))[0]!
        .client,
    ).toBe('curl');
    expect(
      (await rowsFor(init('claude-ai'), { 'User-Agent': 'subsola-health/1' }))[0]!.client,
    ).toBe('subsola-health');
  });

  it('records protocol errors but not notifications, the docs page or preflights', async () => {
    expect((await rowsFor('{oops'))[0]).toMatchObject({
      method: 'invalid',
      outcome: 'protocol_error',
    });
    expect((await rowsFor(rpc('my/own/method')))[0]).toMatchObject({
      method: 'other',
      outcome: 'protocol_error',
    });
    expect(await rowsFor({ jsonrpc: '2.0', method: 'notifications/initialized' })).toEqual([]);
    const rows: CallRecord[] = [];
    const record = (row: CallRecord) => rows.push(row);
    await handleMcp(new Request('https://subsola.com/mcp', { headers: { Accept: 'text/html' } }), {
      ...deps(),
      record,
    });
    await handleMcp(new Request('https://subsola.com/mcp', { method: 'OPTIONS' }), {
      ...deps(),
      record,
    });
    expect(rows).toEqual([]);
  });

  it('never lets the raw IP reach the stored row, only its requester ID', async () => {
    stubNetwork();
    const ip = '198.51.100.7';
    const bound: unknown[][] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => {
          bound.push(values);
          return { sql, values };
        },
      }),
      batch: async () => undefined,
    };
    const saving: Promise<void>[] = [];
    await handleMcp(
      post(whatsUnder('1420 5th Ave, Seattle'), {
        'CF-Connecting-IP': ip,
        'User-Agent': 'claude-code/2.1.0 (cli; node 22)',
      }),
      {
        ...deps(),
        // As functions/mcp.ts wires it.
        record: (call, request) =>
          saving.push(
            requesterOf(request, 'key').then((who) => saveCall(db, { ...call, ...who }, () => 1)),
          ),
      },
    );
    await Promise.all(saving);
    expect(bound).toHaveLength(1);
    const stored = JSON.stringify(bound);
    expect(stored).not.toContain(ip);
    expect(stored).not.toContain('198.51');
    expect(stored).not.toMatch(/1420|5th|claude-code/i);
    expect(bound[0]).toContain(await requesterId('key', ip));
  });

  it('answers even when recording throws', async () => {
    const res = await handleMcp(post(rpc('ping')), {
      ...deps(),
      record: () => {
        throw new Error('D1 down');
      },
    });
    expect(res.status).toBe(200);
  });
});
