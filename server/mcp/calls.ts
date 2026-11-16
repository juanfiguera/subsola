import type { RegionId } from '../../src/regions';

/**
 * One stats row per JSON-RPC request /mcp handles (migrations/0003_mcp_calls.sql), so the owner
 * can see how the server is doing at /mcp/stats. Every field is a label from a fixed set or a
 * number: what was asked never is, and neither is the IP or the raw User-Agent.
 */

/** How a call ended. Where each is decided: tools.ts (tool runs) and protocol.ts (the rest). */
export const OUTCOMES = [
  'answered',
  // An address in a covered city that didn't match (house number, street, borough).
  'no_match',
  // An address in a place Subsola doesn't cover.
  'outside_coverage',
  // Found the address, but no built cells reach it.
  'no_records',
  'bad_args',
  // A geocoder timed out, or the cell index or every cell failed to load.
  'upstream_error',
  'rate_limited',
  // A tool threw.
  'server_error',
  // Not an MCP call we could serve: bad JSON, an unknown method, a header mismatch.
  'protocol_error',
] as const;

export type CallOutcome = (typeof OUTCOMES)[number];

/** What a handler knows about a call once it has an answer. */
export interface CallFacts {
  outcome: CallOutcome;
  /** A tool or prompt name the server has, never whatever name a client sent. */
  tool: string | null;
  region: RegionId | null;
  /** For outside_coverage only: a place from missedPlace.ts's fixed list, or null. */
  missedPlace: string | null;
}

export interface CallRecord extends CallFacts {
  /** Unix seconds. */
  at: number;
  method: string;
  durationMs: number;
  client: string;
  protocol: string | null;
}

export const HEALTH_CLIENT = 'subsola-health';

// Methods a client may send; anything else is stored as "other" so a client can't write its own.
const METHODS = new Set([
  'initialize',
  'ping',
  'server/discover',
  'tools/list',
  'tools/call',
  'prompts/list',
  'prompts/get',
  'resources/list',
  'resources/read',
  'resources/templates/list',
  'completion/complete',
  'logging/setLevel',
]);

export const methodLabel = (method: unknown): string => {
  if (typeof method !== 'string') return 'invalid';
  return METHODS.has(method) ? method : 'other';
};

/** A protocol version only when it looks like one ("2025-06-18"). */
export const protocolLabel = (value: unknown): string | null =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

// Checked in order: "claude-code ... node" is Claude, "Cursor/1 (vscode)" is Cursor.
const FAMILIES: [string, RegExp][] = [
  ['claude', /claude|anthropic/],
  ['openai', /openai|chatgpt|codex/],
  ['cursor', /cursor/],
  ['windsurf', /windsurf|codeium|devin/],
  ['vscode', /vscode|visual studio code|copilot/],
  ['cline', /cline|\broo[- ]?code\b/],
  ['zed', /\bzed\b/],
  ['goose', /goose/],
  ['gemini', /gemini/],
  ['inspector', /inspector/],
  ['python', /python|httpx|aiohttp|requests/],
  ['node', /node|undici|axios|bun|deno/],
  ['go', /go-http-client/],
  ['curl', /curl|wget/],
  ['browser', /mozilla/],
];

/** The family a User-Agent belongs to, from FAMILIES; never the header itself. */
export const userAgentFamily = (userAgent: string | null): string => {
  if (!userAgent?.trim()) return 'none';
  const lower = userAgent.toLowerCase();
  if (lower.startsWith(HEALTH_CLIENT)) return HEALTH_CLIENT;
  return FAMILIES.find(([, pattern]) => pattern.test(lower))?.[0] ?? 'other';
};

/**
 * An initialize's clientInfo.name as one of the FAMILIES ("claude-ai" is "claude"), or null for
 * any other name. A client writes that name itself and it could be anything, a person's name
 * included, so only a known family is kept, never the text.
 */
export const clientNameLabel = (name: unknown): string | null => {
  if (typeof name !== 'string' || !name.trim() || name.length > 200) return null;
  const lower = name.toLowerCase();
  return FAMILIES.find(([, pattern]) => pattern.test(lower))?.[0] ?? null;
};

/**
 * Who made a call, as a short label: the app's own name on initialize, otherwise the family its
 * User-Agent belongs to. The health check always says so, whatever the method.
 */
export const clientLabel = (userAgent: string | null, clientName?: unknown): string => {
  const family = userAgentFamily(userAgent);
  if (family === HEALTH_CLIENT) return family;
  return clientNameLabel(clientName) ?? family;
};
