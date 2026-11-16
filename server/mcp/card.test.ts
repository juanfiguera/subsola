import { describe, expect, it } from 'vitest';
import { aiCatalog, handleServerCard, handleWellKnown, serverCard } from './card';
import { SERVER_VERSION } from './changelog';
import { FULL_SERVER_INFO } from './meta';
import { SUPPORTED_PROTOCOLS } from './protocolVersions';

const get = (path: string, init: RequestInit = {}) =>
  new Request(`https://subsola.com${path}`, init);

describe('server card', () => {
  it('says what serverInfo says, within the extension’s limits', () => {
    const card = serverCard();
    expect(card).toMatchObject({
      name: 'com.subsola/subsola',
      version: SERVER_VERSION,
      title: FULL_SERVER_INFO.title,
      description: FULL_SERVER_INFO.description,
      websiteUrl: FULL_SERVER_INFO.websiteUrl,
      remotes: [
        {
          type: 'streamable-http',
          url: 'https://subsola.com/mcp',
          supportedProtocolVersions: SUPPORTED_PROTOCOLS,
        },
      ],
    });
    expect(card.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
    expect(card.description.length).toBeLessThanOrEqual(100);
  });

  it('is served as application/mcp-server-card+json with CORS, caching and an ETag', async () => {
    const res = await handleServerCard(get('/mcp/server-card'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/mcp-server-card+json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
    const etag = res.headers.get('ETag')!;
    expect(await res.json()).toEqual(serverCard());
    const again = await handleServerCard(
      get('/mcp/server-card', { headers: { 'If-None-Match': etag } }),
    );
    expect(again.status).toBe(304);
    expect((await handleServerCard(get('/mcp/server-card', { method: 'POST' }))).status).toBe(405);
  });
});

describe('/.well-known', () => {
  const spaFallback = async () =>
    new Response('<!doctype html><title>Subsola</title>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });

  it('serves the AI catalog pointing at the card', async () => {
    const res = await handleWellKnown(get('/.well-known/ai-catalog.json'), spaFallback);
    expect(res.headers.get('Content-Type')).toBe('application/ai-catalog+json');
    expect(await res.json()).toEqual(aiCatalog());
    expect(aiCatalog().entries[0]).toMatchObject({
      type: 'application/mcp-server-card+json',
      url: 'https://subsola.com/mcp/server-card',
    });
  });

  it('answers an unknown path with 404, not the map’s HTML', async () => {
    const res = await handleWellKnown(get('/.well-known/openid-configuration'), spaFallback);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Not Found');
  });

  it('lets a real file under .well-known through', async () => {
    const file = async () =>
      new Response('v=MCPv1; k=ed25519; p=abc', { headers: { 'Content-Type': 'text/plain' } });
    const res = await handleWellKnown(get('/.well-known/mcp-registry-auth'), file);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('v=MCPv1');
  });
});
