import { z } from 'zod';
import { docsPage, docsPageHeaders, newNonce } from './page';
import { TOOLS, callTool, toolList, type ToolDeps } from './tools';
import { CHECK_BEFORE_DIGGING, getPrompt, promptList } from './prompts';
import {
  clientLabel,
  methodLabel,
  protocolLabel,
  type CallFacts,
  type CallOutcome,
  type CallRecord,
} from './calls';
import { BASE_SERVER_INFO, FULL_SERVER_INFO, instructions } from './meta';
import { headers, json, originAllowed, wantsHtml } from './http';
import {
  LATEST_LEGACY_PROTOCOL,
  LEGACY_PROTOCOLS,
  MODERN_PROTOCOLS,
  SUPPORTED_PROTOCOLS,
} from './protocolVersions';

export * from './protocolVersions';

/**
 * MCP over Streamable HTTP, stateless: each POST carries one JSON-RPC message and gets one JSON
 * reply. It speaks two eras of the protocol on the same endpoint, as the spec allows a dual-era
 * server to:
 *
 * - Modern (2026-07-28): no handshake and no sessions. Every request names its version in
 *   `params._meta["io.modelcontextprotocol/protocolVersion"]` and repeats it, the method and (for
 *   a call) the name in MCP-Protocol-Version, Mcp-Method and Mcp-Name headers. Results carry
 *   `resultType`, lists carry cache hints, and an unknown method is a 404.
 *   https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning
 * - Legacy (2024-11-05 to 2025-11-25): `initialize` first, then MCP-Protocol-Version on each
 *   request (or none, read as 2025-03-26). Never a session, so GET and DELETE are 405.
 *   https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
 *
 * A browser's GET gets the docs page instead of a 405 (page.ts).
 */

// The spec's answer for a POST without MCP-Protocol-Version, from clients older than 2025-06-18.
const HEADERLESS_PROTOCOL = '2025-03-26';

const META_VERSION = 'io.modelcontextprotocol/protocolVersion';
const META_SERVER = 'io.modelcontextprotocol/serverInfo';
// The spec's own error codes, 2026-07-28.
const HEADER_MISMATCH = -32020;
const UNSUPPORTED_VERSION = -32022;
// How long a client may reuse the tool and prompt lists: they change only with a deploy.
const LIST_TTL_MS = 3_600_000;
// Bigger than any real tool call; anything larger isn't one.
const MAX_BODY_BYTES = 16_384;

/** Icons and the server's description arrived in 2025-11-25; earlier clients get neither. */
const hasIcons = (version: string) => version >= '2025-11-25';

type Id = string | number | null;

const rpcError = (id: Id, code: number, message: string, status = 200, data?: unknown) =>
  json(
    { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined && { data }) } },
    status,
  );

const rpcResult = (id: Id, result: unknown) => json({ jsonrpc: '2.0', id, result });

const messageSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
});

type Message = z.infer<typeof messageSchema>;

const readBody = async (request: Request): Promise<unknown> => {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new Error('too large');
  return JSON.parse(text);
};

/** The version a modern request names in its _meta, if it names one. */
const metaVersion = (message: Message): string | null => {
  const meta = message.params?._meta;
  const version =
    meta && typeof meta === 'object' ? (meta as Record<string, unknown>)[META_VERSION] : undefined;
  return typeof version === 'string' ? version : null;
};

/** An Mcp-Name header as sent: plain, or "=?base64?...?=" for a value that isn't plain ASCII. */
const decodeHeaderValue = (value: string): string | null => {
  const encoded = /^=\?base64\?(.*)\?=$/.exec(value)?.[1];
  if (encoded === undefined) return value;
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)));
  } catch {
    return null;
  }
};

/** Handles one HTTP request to /mcp. Never throws; every failure is an HTTP or JSON-RPC error. */
export interface McpDeps extends ToolDeps {
  /** Seconds until this caller may ask again, or null to answer; see limit.ts. */
  limit?: (request: Request) => Promise<number | null>;
  /**
   * Takes one stats row per JSON-RPC request, with the request so the caller's anonymous ID can
   * be added (requester.ts); it must not throw or make the reply wait.
   */
  record?: (call: CallRecord, request: Request) => void;
}

const facts = (outcome: CallOutcome, tool: string | null = null): CallFacts => ({
  outcome,
  tool,
  region: null,
  missedPlace: null,
});

/** A name the server has, so a client can't put its own text in the stats. */
const toolName = (name: unknown) => TOOLS.find((tool) => tool.name === name)?.name ?? null;
const promptName = (name: unknown) => (name === CHECK_BEFORE_DIGGING ? CHECK_BEFORE_DIGGING : null);

/** A reply and what the stats should say about it. */
interface Handled {
  response: Response;
  facts: CallFacts;
}

/** Told as a tool error rather than an HTTP 429, so the assistant passes it on instead of looping. */
const tooMany = (wait: number) => ({
  content: [
    {
      type: 'text',
      text: `Subsola is answering too many questions from here right now. Try again in ${wait} seconds.`,
    },
  ],
  isError: true,
});

/** What a method returns, the same in both eras apart from the wrapping each adds. */
type Outcome = (
  | { kind: 'result'; result: Record<string, unknown>; cacheable?: boolean }
  | { kind: 'error'; code: number; message: string }
  | { kind: 'unknown' }
) & { facts: CallFacts };

const answer = async (
  message: Message,
  version: string,
  request: Request,
  deps: McpDeps,
): Promise<Outcome> => {
  const icons = hasIcons(version);
  switch (message.method) {
    case 'tools/list':
      return {
        kind: 'result',
        result: { tools: toolList({ icons }) },
        cacheable: true,
        facts: facts('answered'),
      };
    case 'prompts/list':
      return {
        kind: 'result',
        result: { prompts: promptList({ icons }) },
        cacheable: true,
        facts: facts('answered'),
      };
    case 'prompts/get': {
      const prompt = getPrompt(message.params?.name, message.params?.arguments);
      const name = promptName(message.params?.name);
      return prompt.ok
        ? { kind: 'result', result: prompt.result, facts: facts('answered', name) }
        : { kind: 'error', code: -32602, message: prompt.message, facts: facts('bad_args', name) };
    }
    case 'tools/call': {
      const wait = deps.limit ? await deps.limit(request) : null;
      if (wait !== null)
        return {
          kind: 'result',
          result: tooMany(wait),
          facts: facts('rate_limited', toolName(message.params?.name)),
        };
      const call = await callTool(message.params?.name, message.params?.arguments, deps);
      return call.ok
        ? { kind: 'result', result: call.result, facts: call.facts }
        : { kind: 'error', code: call.code, message: call.message, facts: call.facts };
    }
    default:
      return { kind: 'unknown', facts: facts('protocol_error') };
  }
};

const CAPABILITIES = { tools: { listChanged: false }, prompts: { listChanged: false } };

/** A 2026-07-28 request: checked against its headers, answered without any session. */
const handleModern = async (
  message: Message,
  id: Id,
  version: string,
  request: Request,
  deps: McpDeps,
): Promise<Handled> => {
  const refused = (response: Response): Handled => ({
    response,
    facts: facts('protocol_error'),
  });
  if (!MODERN_PROTOCOLS.includes(version))
    return refused(
      rpcError(id, UNSUPPORTED_VERSION, 'Unsupported protocol version', 400, {
        supported: SUPPORTED_PROTOCOLS,
        requested: version,
      }),
    );
  const mismatch = (text: string) =>
    refused(rpcError(id, HEADER_MISMATCH, `Header mismatch: ${text}`, 400));
  const headerVersion = request.headers.get('MCP-Protocol-Version');
  if (headerVersion !== version)
    return mismatch(
      headerVersion
        ? `MCP-Protocol-Version header value '${headerVersion}' does not match body value '${version}'`
        : 'MCP-Protocol-Version header is missing',
    );
  const headerMethod = request.headers.get('Mcp-Method');
  if (headerMethod !== message.method)
    return mismatch(
      headerMethod
        ? `Mcp-Method header value '${headerMethod}' does not match body value '${message.method}'`
        : 'Mcp-Method header is missing',
    );
  if (message.method === 'tools/call' || message.method === 'prompts/get') {
    const raw = request.headers.get('Mcp-Name');
    const name = raw === null ? null : decodeHeaderValue(raw);
    if (name !== message.params?.name)
      return mismatch(
        raw === null
          ? 'Mcp-Name header is missing'
          : `Mcp-Name header value '${raw}' does not match body value '${String(message.params?.name)}'`,
      );
  }

  const wrap = (result: Record<string, unknown>, cacheable = false) =>
    rpcResult(id, {
      ...result,
      resultType: 'complete',
      ...(cacheable && { ttlMs: LIST_TTL_MS, cacheScope: 'public' }),
      _meta: { [META_SERVER]: FULL_SERVER_INFO },
    });

  if (message.method === 'server/discover')
    return {
      response: wrap(
        {
          supportedVersions: SUPPORTED_PROTOCOLS,
          capabilities: CAPABILITIES,
          instructions: instructions(),
        },
        true,
      ),
      facts: facts('answered'),
    };
  const outcome = await answer(message, version, request, deps);
  const response =
    outcome.kind === 'result'
      ? wrap(outcome.result, outcome.cacheable)
      : outcome.kind === 'error'
        ? rpcError(id, outcome.code, outcome.message)
        : rpcError(id, -32601, `Method not found: ${message.method}`, 404);
  return { response, facts: outcome.facts };
};

/** A request in the initialize era (2024-11-05 to 2025-11-25). */
const handleLegacy = async (
  message: Message,
  id: Id,
  request: Request,
  deps: McpDeps,
): Promise<Handled> => {
  if (message.method === 'initialize') {
    const requested = message.params?.protocolVersion;
    const version =
      typeof requested === 'string' && LEGACY_PROTOCOLS.includes(requested)
        ? requested
        : LATEST_LEGACY_PROTOCOL;
    return {
      response: rpcResult(id, {
        protocolVersion: version,
        capabilities: CAPABILITIES,
        serverInfo: hasIcons(version) ? FULL_SERVER_INFO : BASE_SERVER_INFO,
        instructions: instructions(),
      }),
      facts: facts('answered'),
    };
  }
  // After initialize the client names the version it settled on; one we never offered is a 400.
  const header = request.headers.get('MCP-Protocol-Version');
  if (header && MODERN_PROTOCOLS.includes(header))
    return {
      response: rpcError(
        id,
        HEADER_MISMATCH,
        `Header mismatch: MCP-Protocol-Version is ${header} but the body has no _meta "${META_VERSION}"`,
        400,
      ),
      facts: facts('protocol_error'),
    };
  if (header && !LEGACY_PROTOCOLS.includes(header))
    return {
      response: rpcError(id, -32600, `Unsupported MCP-Protocol-Version: ${header}`, 400),
      facts: facts('protocol_error'),
    };
  const version = header ?? HEADERLESS_PROTOCOL;
  if (message.method === 'ping') return { response: rpcResult(id, {}), facts: facts('answered') };
  const outcome = await answer(message, version, request, deps);
  const response =
    outcome.kind === 'result'
      ? rpcResult(id, outcome.result)
      : outcome.kind === 'error'
        ? rpcError(id, outcome.code, outcome.message)
        : rpcError(id, -32601, `Method not found: ${message.method}`);
  return { response, facts: outcome.facts };
};

/** What the stats need from a JSON-RPC request; HTTP-only replies (GET, OPTIONS, 405) have none. */
interface Routed {
  response: Response;
  call?: Handled & { method: unknown; params?: Record<string, unknown> };
}

const route = async (request: Request, deps: McpDeps): Promise<Routed> => {
  if (!originAllowed(request.headers.get('Origin')))
    return {
      response: json(
        { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Origin not allowed' } },
        403,
      ),
    };
  if (request.method === 'OPTIONS')
    return { response: new Response(null, { status: 204, headers: headers() }) };
  if (request.method === 'GET' && wantsHtml(request.headers.get('Accept'))) {
    const nonce = newNonce();
    return {
      response: new Response(docsPage(nonce), {
        status: 200,
        headers: headers(docsPageHeaders(nonce)),
      }),
    };
  }
  if (request.method !== 'POST')
    return {
      response: new Response('Method Not Allowed', {
        status: 405,
        headers: headers({ Allow: 'POST, OPTIONS', 'Content-Type': 'text/plain' }),
      }),
    };

  const invalid = (response: Response): Routed => ({
    response,
    call: { response, method: null, facts: facts('protocol_error') },
  });
  let body: unknown;
  try {
    body = await readBody(request);
  } catch {
    return invalid(rpcError(null, -32700, 'Parse error', 400));
  }
  // Protocol 2025-06-18 dropped JSON-RPC batches.
  if (Array.isArray(body)) return invalid(rpcError(null, -32600, 'Batches are not supported', 400));
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) return invalid(rpcError(null, -32600, 'Invalid Request', 400));
  const message = parsed.data;
  const id = message.id ?? null;

  // A notification or a reply to us: accepted, nothing to say back, and not a call to count.
  if (message.id === undefined || message.method === undefined) {
    if (message.method === undefined && message.result === undefined && message.error === undefined)
      return invalid(rpcError(null, -32600, 'Invalid Request', 400));
    return { response: new Response(null, { status: 202, headers: headers() }) };
  }

  // An initialize always opens the legacy era; per-request _meta marks the modern one.
  const version = message.method === 'initialize' ? null : metaVersion(message);
  const handled =
    version === null
      ? await handleLegacy(message, id, request, deps)
      : await handleModern(message, id, version, request, deps);
  return {
    response: handled.response,
    call: { ...handled, method: message.method, params: message.params },
  };
};

/** The stats row for a handled call: labels and numbers only, never what was asked. */
const callRecord = (
  request: Request,
  call: NonNullable<Routed['call']>,
  started: number,
): CallRecord => {
  const initialize = call.method === 'initialize';
  const clientInfo = initialize ? call.params?.clientInfo : undefined;
  const clientName =
    clientInfo && typeof clientInfo === 'object'
      ? (clientInfo as Record<string, unknown>).name
      : undefined;
  return {
    ...call.facts,
    at: Math.floor(started / 1000),
    method: methodLabel(call.method),
    durationMs: Math.max(0, Date.now() - started),
    client: clientLabel(request.headers.get('User-Agent'), clientName),
    protocol: protocolLabel(
      request.headers.get('MCP-Protocol-Version') ??
        (initialize ? call.params?.protocolVersion : undefined),
    ),
  };
};

export const handleMcp = async (request: Request, deps: McpDeps): Promise<Response> => {
  // Workers move the clock only on I/O, so this measures waiting on geocoders and cells, which
  // is most of a call; pure CPU time after the last fetch doesn't show.
  const started = Date.now();
  const { response, call } = await route(request, deps);
  if (call && deps.record) {
    try {
      deps.record(callRecord(request, call, started), request);
    } catch (error) {
      console.error('mcp stats: record failed', error instanceof Error ? error.name : 'error');
    }
  }
  return response;
};
