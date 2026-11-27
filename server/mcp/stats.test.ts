/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { loadStats, rangeOf, rangeStart, type Stats } from './stats';
import { statsPage } from './statsPage';
import { handleStats } from './statsRoute';
import { authorized, basicPassword, sameSecret } from './basicAuth';
import { INSERT_CALL } from './callLog';
import { sitemapPaths, robotsTxt } from '../../src/pages/siteFiles';

const NOW = Date.UTC(2026, 10, 14, 15, 30) / 1000;

const MIGRATIONS = new URL('../../migrations/', import.meta.url);

/** The real migrations in an in-memory SQLite, behind the slice of D1's API the code uses. */
const database = () => {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(new URL(name, MIGRATIONS), 'utf8'));
  type Statement = { sql: string; values: unknown[] };
  const db = {
    prepare: (sql: string) => ({ bind: (...values: unknown[]): Statement => ({ sql, values }) }),
    batch: async <T>(statements: Statement[]) =>
      statements.map(({ sql, values }) => ({
        results: sqlite.prepare(sql).all(...(values as (string | number | null)[])) as T[],
      })),
  };
  const insert = (row: Partial<Record<string, string | number | null>>) => {
    // A key given as null stays null; a key left out takes the default.
    const value = (key: string, fallback: string | number | null) =>
      key in row ? (row[key] ?? null) : fallback;
    sqlite
      .prepare(INSERT_CALL)
      .run(
        value('at', NOW - 60),
        value('method', 'tools/call'),
        value('tool', 'whats_under'),
        value('region', 'nyc'),
        value('outcome', 'answered'),
        value('duration', 500),
        value('client', 'claude'),
        value('protocol', '2025-06-18'),
        value('missed', null),
        value('requester', 'aaaaaaaaaaaa'),
        value('network', 'Anthropic, PBC'),
        value('country', 'US'),
        value('problem', null),
      );
  };
  const insertHealth = (row: {
    at: number;
    ok: boolean;
    duration?: number;
    reason?: string;
    message?: string;
  }) =>
    sqlite
      .prepare(
        'INSERT INTO health_checks (at, ok, duration_ms, reason, message) VALUES (?, ?, ?, ?, ?)',
      )
      .run(row.at, row.ok ? 1 : 0, row.duration ?? 800, row.reason ?? null, row.message ?? null);
  return { db, insert, insertHealth };
};

describe('loadStats', () => {
  it('breaks bad arguments down by what failed, and leaves unknown tools out of tool calls', async () => {
    const { db, insert } = database();
    insert({});
    insert({ outcome: 'bad_args', problem: 'address:missing' });
    insert({ outcome: 'bad_args', problem: 'address:missing' });
    insert({ outcome: 'bad_args', problem: 'utility:invalid_value' });
    insert({ outcome: 'unknown_tool', tool: null });
    const stats = await loadStats(db, '7d', NOW);
    expect(stats.badArgs).toEqual([
      { label: 'address:missing', n: 2 },
      { label: 'utility:invalid_value', n: 1 },
    ]);
    expect(stats).toMatchObject({ toolCalls: 4, answered: 1 });
  });

  it('is all zeros on day one', async () => {
    const { db } = database();
    const stats = await loadStats(db, '7d', NOW);
    expect(stats).toMatchObject({ total: 0, toolCalls: 0, answered: 0, p50: null, p95: null });
    expect(stats.series).toHaveLength(7);
    expect(stats.series.every((point) => point.n === 0)).toBe(true);
    expect(stats.health).toEqual({ latest: null, total: 0, passed: 0, lastFailure: null });
    expect(stats).toMatchObject({
      requesterCount: 0,
      requesters: [],
      limitedByNetwork: [],
      limitedRequesters: 0,
    });
  });

  it('counts, ranks and leaves the health check out of every figure', async () => {
    const { db, insert, insertHealth } = database();
    for (let i = 1; i <= 20; i++) insert({ duration: i * 100 });
    insert({ outcome: 'outside_coverage', region: null, missed: 'Boston, MA' });
    insert({ outcome: 'outside_coverage', region: null, missed: 'Boston, MA' });
    insert({ outcome: 'outside_coverage', region: null, missed: 'Portland, OR' });
    insert({ outcome: 'outside_coverage', region: null, missed: null });
    insert({ method: 'initialize', tool: null, region: null, client: 'claude-ai' });
    insert({ tool: 'recent_digs', region: 'sea', at: NOW - 3 * 86_400 });
    // Older than the range.
    insert({ at: NOW - 40 * 86_400 });
    insert({ client: 'subsola-health', at: NOW - 600, duration: 900 });
    insert({ client: 'subsola-health', at: NOW - 1500, outcome: 'upstream_error' });
    insertHealth({ at: NOW - 300, ok: true, duration: 900 });
    insertHealth({
      at: NOW - 600,
      ok: false,
      duration: 20_000,
      reason: 'unreachable',
      message: 'x',
    });
    insertHealth({ at: NOW - 2 * 86_400, ok: false, reason: 'slow' });

    const stats = await loadStats(db, '7d', NOW);
    expect(stats.total).toBe(26);
    expect(stats.toolCalls).toBe(25);
    expect(stats.answered).toBe(21);
    expect(stats.p95).toBeGreaterThanOrEqual(stats.p50!);
    expect(stats.byTool).toEqual([
      { label: 'whats_under', n: 24 },
      { label: 'recent_digs', n: 1 },
    ]);
    expect(stats.byCity[0]).toEqual({ label: 'nyc', n: 20 });
    expect(stats.byOutcome).toEqual([
      { label: 'answered', n: 21 },
      { label: 'outside_coverage', n: 4 },
    ]);
    expect(stats.byClient).toEqual([
      { label: 'claude', n: 25 },
      { label: 'claude-ai', n: 1 },
    ]);
    expect(stats.missed).toEqual([
      { label: 'Boston, MA', n: 2 },
      { label: null, n: 1 },
      { label: 'Portland, OR', n: 1 },
    ]);
    expect(stats.series.reduce((sum, point) => sum + point.n, 0)).toBe(26);
    expect(stats.health).toEqual({
      latest: { at: NOW - 300, ok: true, durationMs: 900, reason: null, message: null },
      total: 2,
      passed: 1,
      lastFailure: {
        at: NOW - 600,
        ok: false,
        durationMs: 20_000,
        reason: 'unreachable',
        message: 'x',
      },
    });
    expect((await loadStats(db, '24h', NOW)).series).toHaveLength(24);
    expect((await loadStats(db, '30d', NOW)).total).toBe(26);
  });

  it('lists requesters with their cities, apps, days and success, health checks left out', async () => {
    const { db, insert } = database();
    const DAY = 86_400;
    // A regular: three distinct days, four cities, two app families.
    insert({ requester: 'r1', at: NOW - 60 });
    insert({ requester: 'r1', at: NOW - 120, region: 'sea' });
    insert({ requester: 'r1', at: NOW - DAY, region: 'sea', outcome: 'no_match' });
    insert({ requester: 'r1', at: NOW - 2 * DAY, region: 'chi' });
    insert({ requester: 'r1', at: NOW - 2 * DAY, region: 'dc' });
    insert({ requester: 'r1', method: 'initialize', tool: null, region: null, client: 'node' });
    // One call, from another network and country.
    insert({ requester: 'r2', network: 'OpenAI', country: 'IE', client: 'openai' });
    // Before requester IDs: counted elsewhere, not here.
    insert({ requester: null, network: null, country: null });
    insert({ requester: 'health', client: 'subsola-health' });
    // Older than the range.
    insert({ requester: 'r3', at: NOW - 40 * DAY });

    const stats = await loadStats(db, '7d', NOW);
    expect(stats.requesterCount).toBe(2);
    expect(stats.requesters).toHaveLength(2);
    const [regular, once] = stats.requesters;
    expect(regular).toMatchObject({
      requester: 'r1',
      network: 'Anthropic, PBC',
      country: 'US',
      calls: 6,
      toolCalls: 5,
      answered: 4,
      clients: ['claude', 'node'],
      firstSeen: NOW - 2 * DAY,
      days: 3,
    });
    expect(regular!.regions[0]).toBe('sea');
    expect([...regular!.regions].sort()).toEqual(['chi', 'dc', 'nyc', 'sea']);
    expect(regular!.lastSeen).toBe(NOW - 60);
    expect(once).toMatchObject({
      requester: 'r2',
      network: 'OpenAI',
      country: 'IE',
      calls: 1,
      regions: ['nyc'],
      clients: ['openai'],
      days: 1,
    });
  });

  it('groups rate-limited calls by network, with the requesters limited', async () => {
    const { db, insert } = database();
    for (let i = 0; i < 4; i++)
      insert({ requester: 'a1', network: 'OpenAI', outcome: 'rate_limited' });
    insert({ requester: 'a2', network: 'OpenAI', outcome: 'rate_limited' });
    insert({ requester: 'a3', network: 'OpenAI' });
    insert({ requester: 'b1', network: null, outcome: 'rate_limited' });
    insert({ requester: 'c1', network: 'Comcast Cable' });
    insert({
      requester: 'h',
      network: 'Amazon',
      client: 'subsola-health',
      outcome: 'rate_limited',
    });

    const stats = await loadStats(db, '7d', NOW);
    expect(stats.limitedByNetwork).toEqual([
      { network: 'OpenAI', limited: 5, requesters: 2, calls: 6 },
      { network: null, limited: 1, requesters: 1, calls: 1 },
    ]);
    expect(stats.limitedRequesters).toBe(3);
  });

  it('reads the median and p95 by nearest rank', async () => {
    const { db, insert } = database();
    for (let i = 1; i <= 100; i++) insert({ duration: i });
    const stats = await loadStats(db, '24h', NOW);
    expect([stats.p50, stats.p95]).toEqual([50, 95]);
  });

  it('starts a range on a whole bucket and defaults to 7 days', () => {
    expect(rangeStart('24h', NOW) % 3600).toBe(0);
    expect(rangeStart('7d', NOW)).toBe(Date.UTC(2026, 10, 8) / 1000);
    expect(rangeOf('30d')).toBe('30d');
    expect(rangeOf('1y')).toBe('7d');
    expect(rangeOf(null)).toBe('7d');
  });
});

const sample = (overrides: Partial<Stats> = {}): Stats => ({
  range: '7d',
  now: NOW,
  total: 120,
  toolCalls: 90,
  answered: 81,
  p50: 640,
  p95: 2100,
  series: Array.from({ length: 7 }, (_, i) => ({
    label: String(rangeStart('7d', NOW) + i * 86_400),
    n: i * 3,
  })),
  byTool: [{ label: 'whats_under', n: 70 }],
  byCity: [
    { label: 'nyc', n: 50 },
    { label: null, n: 9 },
  ],
  byOutcome: [
    { label: 'answered', n: 81 },
    { label: 'outside_coverage', n: 9 },
  ],
  byClient: [{ label: 'claude-ai', n: 60 }],
  byMethod: [{ label: 'tools/call', n: 90 }],
  missed: [
    { label: 'Boston, MA', n: 6 },
    { label: null, n: 3 },
  ],
  requesterCount: 2,
  requesters: [
    {
      requester: '3f9a0c1d22be',
      network: 'Anthropic, PBC',
      country: 'US',
      calls: 40,
      toolCalls: 30,
      answered: 27,
      regions: ['nyc', 'sea', 'chi', 'dc', 'la'],
      clients: ['claude'],
      firstSeen: NOW - 5 * 86_400,
      lastSeen: NOW - 600,
      days: 4,
    },
    {
      requester: '77e01b9a4c05',
      network: null,
      country: null,
      calls: 2,
      toolCalls: 1,
      answered: 0,
      regions: [],
      clients: ['curl', 'node'],
      firstSeen: NOW - 3600,
      lastSeen: NOW - 3000,
      days: 1,
    },
  ],
  limitedByNetwork: [{ network: 'OpenAI', limited: 12, requesters: 2, calls: 50 }],
  limitedRequesters: 2,
  badArgs: [{ label: 'address:missing', n: 4 }],
  health: {
    latest: { at: NOW - 300, ok: true, durationMs: 812, reason: null, message: null },
    total: 288,
    passed: 287,
    lastFailure: {
      at: NOW - 7200,
      ok: false,
      durationMs: 20_000,
      reason: 'unreachable',
      message: 'initialize: no answer within 20 s (TimeoutError)',
    },
  },
  ...overrides,
});

describe('statsPage', () => {
  const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('shows an empty state on day one', async () => {
    const stats = await loadStats(database().db, '24h', NOW);
    const text = textOf(statsPage(stats, 'n'));
    expect(text).toContain('No calls in the last 24 hours yet');
    expect(text).toContain('No health check has run yet');
  });

  it('shows empty Requesters and Rate limited sections when there are none', () => {
    const text = textOf(
      statsPage(
        sample({ requesterCount: 0, requesters: [], limitedByNetwork: [], limitedRequesters: 0 }),
        'n',
      ),
    );
    expect(text).toContain('0 distinct requesters in the last 7 days');
    expect(text).toContain('No calls with a requester ID in this range');
    expect(text).toContain('No calls were rate limited in the last 7 days');
  });

  it('shows requesters, regulars and rate limits by network', () => {
    const html = statsPage(sample(), 'n');
    const text = textOf(html);
    for (const part of [
      '2 distinct requesters in the last 7 days',
      '3f9a0c1d22be',
      'regular',
      'Anthropic, PBC',
      'New York City, Seattle, Chicago +2',
      '90%',
      'curl, node',
      'Unknown',
      'Nov 9, 15:30',
      '2 distinct requesters were limited at least once',
      'OpenAI 12 2 50 24%',
    ])
      expect(text).toContain(part);
    // Only the requester active on 3 or more days is a regular.
    expect(html.match(/class="tag">regular/g)).toHaveLength(1);
  });

  it('shows the figures, breakdowns, missed places and the health check', () => {
    const html = statsPage(sample(), 'n');
    const text = textOf(html);
    for (const part of [
      '120',
      '90%',
      '640 ms',
      '2,100 ms',
      'New York City',
      'No city',
      'Boston, MA',
      'Not recognized',
      'claude-ai',
      'Passed in 812 ms',
      '287 of 288 passed',
      'Last failure: no answer from subsola.com/mcp, 2 hours ago',
      'initialize: no answer within 20 s',
    ])
      expect(text).toContain(part);
    expect(html).toContain('href="?range=24h"');
    expect(html).toContain('<a href="?range=7d" aria-current="page">');
    expect(html.match(/class="bar"/g)).toHaveLength(6);
    expect(html).toContain('@media (prefers-color-scheme:dark)');
    expect(html).toContain('noindex');
    expect(html).not.toContain(String.fromCharCode(0x2014));
    // The CSP allows no inline style attributes or scripts.
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toContain('<script');
  });

  it('warns when the latest health check failed or went quiet', () => {
    const failed = textOf(
      statsPage(
        sample({
          health: {
            latest: {
              at: NOW - 1200,
              ok: false,
              durationMs: 11_000,
              reason: 'slow',
              message: null,
            },
            total: 4,
            passed: 3,
            lastFailure: null,
          },
        }),
        'n',
      ),
    );
    expect(failed).toContain('Failed: the tool call took over 10 seconds');
    expect(failed).toContain('older than 15 minutes, so the check may have stopped running');
    const fresh = textOf(statsPage(sample(), 'n'));
    expect(fresh).not.toContain('may have stopped running');
  });

  it('escapes whatever comes out of the table', () => {
    const html = statsPage(
      sample({
        byClient: [{ label: '<b>x</b>', n: 1 }],
        limitedByNetwork: [{ network: '<i>net</i>', limited: 1, requesters: 1, calls: 1 }],
      }),
      'n',
    );
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('&lt;i&gt;net&lt;/i&gt;');
  });
});

const basic = (user: string, password: string) =>
  `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`${user}:${password}`)))}`;

describe('basic auth', () => {
  it('reads the password from the header', () => {
    expect(basicPassword(basic('owner', 's3cret:with:colons'))).toBe('s3cret:with:colons');
    expect(basicPassword('Bearer abc')).toBeNull();
    expect(basicPassword('Basic !!!')).toBeNull();
    expect(basicPassword(`Basic ${btoa('no-colon')}`)).toBeNull();
    expect(basicPassword(null)).toBeNull();
  });

  it('compares secrets whole', async () => {
    expect(await sameSecret('right', 'right')).toBe(true);
    expect(await sameSecret('righ', 'right')).toBe(false);
    expect(await sameSecret('right ', 'right')).toBe(false);
    expect(await sameSecret('', 'right')).toBe(false);
  });

  it('takes any user name with the right password, and nobody with no password set', async () => {
    expect(await authorized(basic('anyone', 'pw'), 'pw')).toBe(true);
    expect(await authorized(basic('owner', 'nope'), 'pw')).toBe(false);
    expect(await authorized(basic('owner', ''), '')).toBe(false);
    expect(await authorized(basic('owner', 'pw'), undefined)).toBe(false);
  });
});

describe('handleStats', () => {
  const request = (headers: Record<string, string> = {}, path = '/mcp/stats') =>
    new Request(`https://subsola.com${path}`, { headers });
  const deps = (password: string | undefined = 'pw') => ({
    password,
    db: database().db,
    now: () => new Date(NOW * 1000),
  });

  it('asks for the password, privately', async () => {
    const attempts: Record<string, string>[] = [{}, { Authorization: basic('owner', 'wrong') }];
    for (const headers of attempts) {
      const res = await handleStats(request(headers), deps());
      expect(res.status).toBe(401);
      expect(res.headers.get('WWW-Authenticate')).toMatch(/^Basic realm=/);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
      expect(await res.text()).not.toContain('Calls');
    }
  });

  it('stays shut when STATS_PASSWORD is unset', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await handleStats(request({ Authorization: basic('owner', '') }), deps(undefined));
    expect(res.status).toBe(401);
    error.mockRestore();
  });

  it('serves the page with the password, private and with a nonce CSP', async () => {
    const res = await handleStats(
      request({ Authorization: basic('owner', 'pw') }, '/mcp/stats?range=30d'),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
    const csp = res.headers.get('Content-Security-Policy')!;
    expect(csp).toMatch(/style-src 'nonce-[^']+'/);
    const html = await res.text();
    expect(html).toContain('<a href="?range=30d" aria-current="page">');
    expect(html).toContain('No calls in the last 30 days yet');
  });

  it('is in neither the sitemap nor the robots allow list', () => {
    expect(sitemapPaths().some((path) => path.includes('stats'))).toBe(false);
    expect(robotsTxt()).not.toContain('stats');
  });
});
