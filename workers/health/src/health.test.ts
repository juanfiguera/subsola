/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckResult } from '../../../server/mcp/healthCheck';
import { HEALTH_KEEP_SECONDS, recordRun } from './record';
import { alertMail, rawMessage, testMail } from './email';
import { runHealth, sendTestAlert, type RunDeps } from './run';

const MIGRATIONS = new URL('../../../migrations/', import.meta.url);
const START = Date.UTC(2026, 10, 14, 18, 0) / 1000;
const STEP = 300;

/** The real migrations in an in-memory SQLite, behind the slice of D1's API the Worker uses. */
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
      statements.map(({ sql, values }) => {
        const statement = sqlite.prepare(sql);
        const params = values as (string | number | null)[];
        if (/^\s*(SELECT|WITH)/i.test(sql)) return { results: statement.all(...params) as T[] };
        statement.run(...params);
        return { results: [] as T[] };
      }),
  };
  const rows = () =>
    sqlite
      .prepare('SELECT at, ok, duration_ms, reason, message FROM health_checks ORDER BY at')
      .all();
  return { db, rows };
};

const pass: CheckResult = { ok: true, durationMs: 2300, failures: [], log: [] };
const failed = (reason: 'unreachable' | 'slow' = 'unreachable'): CheckResult => ({
  ok: false,
  durationMs: 20_000,
  failures: [{ reason, message: `initialize: ${reason}`, detail: '<html>a body</html>' }],
  log: [],
});

describe('recordRun', () => {
  /** Records a run of results, one every 5 minutes, and returns each alert. */
  const play = async (results: CheckResult[]) => {
    const { db, rows } = database();
    const alerts = [];
    for (const [i, result] of results.entries())
      alerts.push(await recordRun(db, result, START + i * STEP, () => 0.5));
    return { alerts, rows };
  };

  it('stores each run, its reason and short message, never a body', async () => {
    const { rows } = await play([pass, failed()]);
    expect(rows()).toEqual([
      { at: START, ok: 1, duration_ms: 2300, reason: null, message: null },
      {
        at: START + STEP,
        ok: 0,
        duration_ms: 20_000,
        reason: 'unreachable',
        message: 'initialize: unreachable',
      },
    ]);
    expect(JSON.stringify(rows())).not.toContain('<html>');
  });

  it('alerts once on the second failure in a row, and once on recovery', async () => {
    const { alerts } = await play([pass, failed(), failed(), failed(), failed('slow'), pass, pass]);
    expect(alerts).toEqual([
      null,
      null,
      {
        kind: 'failing',
        at: START + 2 * STEP,
        since: START + STEP,
        reason: 'unreachable',
        message: 'initialize: unreachable',
      },
      null,
      null,
      { kind: 'recovered', at: START + 5 * STEP, since: START + STEP },
      null,
    ]);
  });

  it('stays quiet on a single failure, and alerts from an empty table', async () => {
    expect((await play([pass, failed(), pass, failed(), pass])).alerts.every((a) => !a)).toBe(true);
    expect((await play([failed(), failed()])).alerts[1]).toMatchObject({
      kind: 'failing',
      since: START,
    });
  });

  it('sweeps rows past 30 days now and then', async () => {
    const { db, rows } = database();
    await recordRun(db, pass, START - HEALTH_KEEP_SECONDS - 60, () => 0.5);
    await recordRun(db, pass, START, () => 0);
    expect(rows()).toEqual([expect.objectContaining({ at: START })]);
  });
});

describe('alert mail', () => {
  it('says what failed, since when, where to look and how to run it by hand', () => {
    const mail = alertMail({
      kind: 'failing',
      at: START + STEP,
      since: START,
      reason: 'unreachable',
      message: 'initialize: no answer within 20 s (TimeoutError)',
    });
    expect(mail.subject).toBe('Subsola MCP is failing: no answer from subsola.com/mcp');
    for (const part of [
      'initialize: no answer within 20 s',
      'Failing since: 2026-11-14 18:00 UTC',
      'https://subsola.com/mcp/stats',
      'node .github/scripts/mcp-health.mjs',
    ])
      expect(mail.text).toContain(part);
  });

  it('says when it recovered and how long it was down', () => {
    const mail = alertMail({ kind: 'recovered', at: START + 25 * 60, since: START });
    expect(mail.subject).toBe('Subsola MCP has recovered');
    expect(mail.text).toContain('for about 25 minutes');
  });

  it('builds a one-part MIME message with the headers send_email needs', () => {
    const raw = rawMessage(testMail(new Date(START * 1000)), {
      from: 'health@subsola.com',
      to: 'hello@subsola.com',
      date: new Date(START * 1000),
      id: 'abc',
    });
    const [head, body] = raw.split('\r\n\r\n');
    expect(head).toContain('From: Subsola health <health@subsola.com>');
    expect(head).toContain('To: hello@subsola.com');
    expect(head).toContain('Subject: Subsola MCP health alerts: test');
    expect(head).toContain('Message-ID: <abc@subsola.com>');
    expect(head).toContain('Content-Type: text/plain; charset=utf-8');
    expect(body).toContain('subsola-health Worker');
    // Every line ends in CRLF, as SMTP wants.
    expect(raw.replace(/\r\n/g, '')).not.toContain('\n');
    expect(raw).not.toContain(String.fromCharCode(0x2014));
  });
});

describe('runHealth', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  const setup = (
    results: CheckResult[],
    send = vi.fn<(raw: string) => Promise<void>>(async () => undefined),
  ) => {
    const { db, rows } = database();
    let i = 0;
    const deps: RunDeps<{ sql: string; values: unknown[] }> = {
      db,
      check: async () => results[Math.min(i, results.length - 1)]!,
      send,
      from: 'health@subsola.com',
      to: 'hello@subsola.com',
      now: () => new Date((START + i * STEP) * 1000),
      random: () => 0.5,
    };
    const next = async () => {
      const outcome = await runHealth(deps);
      i++;
      return outcome;
    };
    return { deps, next, rows, send };
  };

  it('emails on the change of state only', async () => {
    const { next, send } = setup([failed(), failed(), failed(), pass]);
    for (let n = 0; n < 5; n++) await next();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![0]).toContain('Subject: Subsola MCP is failing');
    expect(send.mock.calls[1]![0]).toContain('Subject: Subsola MCP has recovered');
  });

  it('records the run even when the email is refused, and logs why', async () => {
    const refuse = vi.fn(async () => {
      throw new Error('destination address not verified');
    });
    const { next, rows } = setup([failed()], refuse);
    await next();
    const outcome = await next();
    expect(outcome).toMatchObject({ sent: false, alert: { kind: 'failing' } });
    expect(rows()).toHaveLength(2);
    expect(console.error).toHaveBeenCalledWith(
      'health: the failing alert was not sent:',
      'destination address not verified',
    );
  });

  it('sends a test alert without recording, and lets a refusal throw', async () => {
    const { deps, rows, send } = setup([pass]);
    await sendTestAlert(deps);
    expect(send.mock.calls[0]![0]).toContain('Subject: Subsola MCP health alerts: test');
    expect(rows()).toEqual([]);
    await expect(
      sendTestAlert({
        ...deps,
        send: async () => {
          throw new Error('refused');
        },
      }),
    ).rejects.toThrow('refused');
  });
});
