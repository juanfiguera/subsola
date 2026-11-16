import { sha256 } from '../hash';
import { MCP_URL } from './clients';
import { REGISTRY_NAME, SERVER_DESCRIPTION, SERVER_ICONS, SERVER_TITLE, SITE_URL } from './meta';
import { SERVER_VERSION } from './changelog';
import { SUPPORTED_PROTOCOLS } from './protocolVersions';

/**
 * The server's card and the site's AI catalog, from the MCP Server Cards extension (SEP-2127):
 * the card at `<streamable-http-url>/server-card`, here /mcp/server-card, and the catalog at
 * /.well-known/ai-catalog.json pointing to it.
 * https://github.com/modelcontextprotocol/ext-server-card/blob/main/docs/discovery.md
 * Both are built from the same constants as serverInfo, so they can't disagree with it. Cards
 * name no tools; clients list those from the server itself.
 */

export const SERVER_CARD_URL = `${MCP_URL}/server-card`;
const CARD_TYPE = 'application/mcp-server-card+json';
const CATALOG_TYPE = 'application/ai-catalog+json';

export const serverCard = () => ({
  $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
  name: REGISTRY_NAME,
  title: SERVER_TITLE,
  version: SERVER_VERSION,
  description: SERVER_DESCRIPTION,
  websiteUrl: MCP_URL,
  icons: SERVER_ICONS,
  remotes: [
    { type: 'streamable-http', url: MCP_URL, supportedProtocolVersions: SUPPORTED_PROTOCOLS },
  ],
});

export const aiCatalog = () => ({
  specVersion: '1.0',
  entries: [
    {
      identifier: `urn:air:${new URL(SITE_URL).hostname}:mcp:subsola`,
      type: CARD_TYPE,
      url: SERVER_CARD_URL,
    },
  ],
});

const CARD_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
  'Access-Control-Expose-Headers': 'ETag',
  'Cache-Control': 'public, max-age=3600',
  'X-Content-Type-Options': 'nosniff',
};

/** A public JSON document with an ETag, answering If-None-Match with 304. */
const document = async (request: Request, body: unknown, type: string): Promise<Response> => {
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: CARD_HEADERS });
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { ...CARD_HEADERS, Allow: 'GET, HEAD, OPTIONS' },
    });
  const text = JSON.stringify(body, null, 2);
  const etag = `"${(await sha256(text)).slice(0, 32)}"`;
  const headers = { ...CARD_HEADERS, ETag: etag, 'Content-Type': type };
  if (request.headers.get('If-None-Match') === etag)
    return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : text, { status: 200, headers });
};

export const handleServerCard = (request: Request) => document(request, serverCard(), CARD_TYPE);

/**
 * /.well-known/*: the AI catalog, then any static file the site ships there (a future
 * mcp-registry-auth, say), and a plain 404 for the rest. Without this the site's single-page
 * fallback would answer every unknown path with the map's HTML and a 200.
 */
export const handleWellKnown = async (
  request: Request,
  next: () => Promise<Response>,
): Promise<Response> => {
  const path = new URL(request.url).pathname;
  if (path === '/.well-known/ai-catalog.json') return document(request, aiCatalog(), CATALOG_TYPE);
  const asset = await next();
  // The single-page fallback is the map's HTML; a real file under .well-known never is.
  if (asset.ok && !(asset.headers.get('Content-Type') ?? '').startsWith('text/html')) return asset;
  return new Response('Not Found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
