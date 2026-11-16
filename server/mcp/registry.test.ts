import { describe, expect, it } from 'vitest';
import { serverCard } from './card';
import serverJsonText from '../../server.json?raw';

/**
 * server.json at the repository root is what `mcp-publisher publish` sends to the MCP Registry.
 * It is a file because the publisher reads one, so this keeps it equal to the server card, which
 * is built from the same constants as serverInfo. Bump the changelog and this test says to bump
 * server.json too. Limits from the registry's 2025-12-11 schema.
 */
const serverJson = JSON.parse(serverJsonText) as {
  $schema: string;
  name: string;
  title: string;
  description: string;
  version: string;
  websiteUrl: string;
  icons: { src: string; mimeType: string; sizes: string[] }[];
  remotes: { type: string; url: string }[];
};

describe('server.json for the MCP Registry', () => {
  it('says what the server card says', () => {
    const card = serverCard();
    expect(serverJson).toMatchObject({
      name: card.name,
      title: card.title,
      description: card.description,
      version: card.version,
      websiteUrl: card.websiteUrl,
      icons: card.icons,
    });
    expect(serverJson.remotes).toEqual([{ type: 'streamable-http', url: card.remotes[0]!.url }]);
  });

  it('fits the registry schema', () => {
    expect(serverJson.$schema).toBe(
      'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    );
    expect(serverJson.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
    expect(serverJson.description.length).toBeLessThanOrEqual(100);
    expect(serverJson.title.length).toBeLessThanOrEqual(100);
    expect(serverJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    for (const icon of serverJson.icons) {
      expect(icon.src).toMatch(/^https:\/\//);
      expect(icon.src.length).toBeLessThanOrEqual(255);
      expect(['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']).toContain(
        icon.mimeType,
      );
      for (const size of icon.sizes) expect(size).toMatch(/^(\d+x\d+|any)$/);
    }
  });
});
