import { describe, expect, it } from 'vitest';
import { docsPage } from './page';
import { REGIONS } from '../../src/regions';
import { LIMITS } from './limit';
import { CLIENTS } from './clients';
import { CHANGELOG } from './changelog';
import { toolList } from './tools';
import { CONTACT_EMAIL } from '../../src/site';

const html = docsPage('nonce');
const text = html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&');

describe('docs page', () => {
  it('names every city in REGIONS and no stale count', () => {
    for (const region of REGIONS) expect(html).toContain(region.name);
    expect(text).toContain(`${REGIONS.length} cities`);
    expect(text).not.toMatch(/\b(six|seven|eight) (US )?cities\b/i);
  });

  it("lists the city input's ids with their names on the tool cards", () => {
    for (const region of REGIONS)
      expect(html).toContain(`<li><code>${region.id}</code>${region.name}</li>`);
  });

  it('states the limits the server enforces', () => {
    for (const limit of LIMITS) expect(text).toContain(limit.max.toLocaleString('en-US'));
    expect(text).toContain('deleted after 2 days');
  });

  it('says what the stats keep, for how long, and that the address and IP are not among it', () => {
    expect(text).toContain('Each call leaves a stats row');
    expect(text).toContain('Never the address or the IP');
    expect(text).toContain(
      'anonymous requester ID, made by scrambling the IP address with a secret key',
    );
    expect(text).toContain('the network’s name and the country');
    expect(text).toContain('deleted after 90 days');
  });

  it('has setup for every client, with the one-click links encoded the way each client reads them', () => {
    for (const client of CLIENTS) {
      // A tab and its panel, tied together both ways for screen readers.
      expect(html).toContain(`id="tab-${client.id}" aria-controls="panel-${client.id}"`);
      expect(html).toContain(`id="panel-${client.id}" aria-labelledby="tab-${client.id}"`);
    }
    // Without the script the tab row stays hidden and every panel shows under its own heading.
    expect(html).toMatch(/role="tablist"[^>]*hidden/);
    expect(text).toContain('claude mcp add --transport http subsola https://subsola.com/mcp');
    expect(text).toContain('codex mcp add subsola --url https://subsola.com/mcp');
    const cursor =
      /cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=subsola&amp;config=([^"]+)"/.exec(
        html,
      );
    expect(JSON.parse(atob(cursor![1]!))).toEqual({ url: 'https://subsola.com/mcp' });
    const vscode =
      /https:\/\/vscode\.dev\/redirect\/mcp\/install\?name=subsola&amp;config=([^"]+)"/.exec(html);
    expect(JSON.parse(decodeURIComponent(vscode![1]!))).toEqual({
      type: 'http',
      url: 'https://subsola.com/mcp',
    });
  });

  it('documents every tool parameter from the live schema', () => {
    for (const tool of toolList()) {
      expect(html).toContain(`id="tool-${tool.name}"`);
      for (const name of Object.keys(tool.inputSchema.properties as object))
        expect(html).toContain(`<code>${name}</code>`);
    }
  });

  it('has every section, the changelog and a contact that is the shared inbox and the feedback form', () => {
    for (const id of [
      'setup',
      'tools',
      'prompts',
      'coverage',
      'data',
      'limits',
      'privacy',
      '811',
      'troubleshooting',
      'changelog',
      'contact',
    ])
      expect(html).toContain(`id="${id}"`);
    expect(text).toContain(CHANGELOG[0]!.date);
    expect(html).toContain('href="/?sel=feedback"');
    expect(html).toContain(`mailto:${CONTACT_EMAIL}`);
    expect(text.replaceAll(CONTACT_EMAIL, '')).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    expect(text).toContain('No sign-in');
    expect(text).toContain(`${REGIONS.length} cities`);
  });

  it('keeps every copy button tied to a block on the page', () => {
    const targets = [...html.matchAll(/data-copy="([^"]+)"/g)].map((match) => match[1]);
    expect(targets.length).toBeGreaterThan(8);
    for (const id of targets) expect(html).toContain(`id="${id}"`);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('has a dark theme that swaps tokens only, set by the site theme script under the nonce', () => {
    expect(html).toContain(':root[data-theme=dark]');
    expect(html).toContain('<script nonce="nonce" src="/theme.js"></script>');
    expect(html).toContain('<link rel="stylesheet" href="/shell.css" nonce="nonce">');
  });

  it('uses no em dashes', () => {
    expect(html).not.toContain(String.fromCharCode(0x2014));
  });
});
