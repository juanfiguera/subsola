/**
 * The HTTP side of /mcp: CORS, JSON replies, telling a browser from an MCP client, and the Origin
 * check. Shared by the MCP endpoint and the server card.
 */

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

export const headers = (extra: Record<string, string> = {}) => ({
  ...CORS,
  'Cache-Control': 'no-store',
  ...extra,
});

export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: headers({ 'Content-Type': 'application/json', ...extra }),
  });

/** Each media range in an Accept header with its weight, lowercased: "text/html;q=0.9". */
const acceptWeights = (accept: string) =>
  accept.split(',').flatMap((part) => {
    const [range, ...params] = part.trim().toLowerCase().split(';');
    if (!range) return [];
    const q = params.map((param) => /^\s*q=([\d.]+)\s*$/.exec(param)?.[1]).find(Boolean);
    const weight = q === undefined ? 1 : Number(q);
    return [{ range: range.trim(), weight: Number.isFinite(weight) ? weight : 0 }];
  });

/**
 * Whether a GET comes from someone reading in a browser. Protocols 2025-03-26 to 2025-11-25 have
 * an MCP client open its stream with a GET that accepts text/event-stream, which must still get a
 * 405 here, so any request naming the stream is a client. Otherwise text/html has to be named
 * outright (not just via a wildcard, as curl and fetch send) and weigh at least as much as JSON.
 */
export const wantsHtml = (accept: string | null): boolean => {
  if (!accept) return false;
  const weights = acceptWeights(accept);
  const weightOf = (range: string) =>
    Math.max(0, ...weights.filter((entry) => entry.range === range).map((entry) => entry.weight));
  if (weights.some((entry) => entry.range === 'text/event-stream' && entry.weight > 0))
    return false;
  const html = weightOf('text/html');
  return html > 0 && html >= weightOf('application/json');
};

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The transport spec says servers MUST validate Origin and answer an invalid one with 403. Its
 * worry is DNS rebinding: a web page reaching a server on the visitor's own machine or network.
 * This server is public, holds no accounts or cookies, and allows any origin by CORS, so a page
 * on any https site may use it the way any MCP client can. Desktop apps can send their own
 * schemes ("vscode-file://vscode-app", "app://", "tauri://localhost") or an opaque "null" from a
 * file: page; refusing them would break real clients and protect nothing here. What it turns away
 * is anything that isn't an origin at all, and plain http from a host other than the developer's
 * own machine (MCP Inspector runs on http://localhost), the one shape a rebinding attack takes.
 * No Origin at all, which is what desktop and server-side clients send, is fine.
 */
export const originAllowed = (origin: string | null): boolean => {
  if (origin === null || origin === 'null') return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:') return true;
  return LOOPBACK.has(url.hostname);
};
