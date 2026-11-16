import { describe, expect, it, vi } from 'vitest';
import { clientLabel, clientNameLabel, methodLabel, protocolLabel, userAgentFamily } from './calls';
import { CALL_KEEP_SECONDS, INSERT_CALL, PRUNE_CALLS, saveCall, type CallRow } from './callLog';
import { missFacts } from './tools';

describe('userAgentFamily', () => {
  it.each([
    ['claude-code/2.1.0 (cli; node 22)', 'claude'],
    ['Claude-User', 'claude'],
    ['openai-mcp/1.0.0', 'openai'],
    ['ChatGPT-User/1.0', 'openai'],
    ['Cursor/1.7.2 (darwin arm64)', 'cursor'],
    ['Visual Studio Code/1.105', 'vscode'],
    ['windsurf/1.12', 'windsurf'],
    ['python-httpx/0.28.1', 'python'],
    ['node', 'node'],
    ['undici', 'node'],
    ['curl/8.7.1', 'curl'],
    ['Mozilla/5.0 (Macintosh)', 'browser'],
    ['subsola-health/1', 'subsola-health'],
    ['SomethingNew/0.1 john@example.com', 'other'],
    [null, 'none'],
    ['', 'none'],
  ])('%s is %s', (agent, family) => {
    expect(userAgentFamily(agent)).toBe(family);
  });

  it('never returns any part of the header', () => {
    const agent = 'MyBot/1.0 (+https://example.com; 1 Main St, Boston; 617-555-0100)';
    expect(['other', 'none']).toContain(userAgentFamily(agent));
  });
});

describe('clientNameLabel', () => {
  it.each([
    ['claude-ai', 'claude'],
    ['Visual Studio Code', 'vscode'],
    ['mcp-inspector', 'inspector'],
    ['openai-mcp', 'openai'],
    ['Roo Code', 'cline'],
    ['cursor-vscode', 'cursor'],
  ])('%s becomes %s', (name, label) => {
    expect(clientNameLabel(name)).toBe(label);
  });

  it.each([
    'John Smith',
    'fast-agent 0.2',
    '1 Main St, Boston',
    '117 West St',
    'call me at 617-555-0100',
    'someone@example.com',
    '<script>alert(1)</script>',
    'x'.repeat(201),
    '',
    '   ',
  ])('keeps no label for %j', (name) => {
    expect(clientNameLabel(name)).toBeNull();
  });

  it('refuses anything that is not a string', () => {
    for (const name of [undefined, null, 42, { name: 'x' }])
      expect(clientNameLabel(name)).toBeNull();
  });
});

describe('clientLabel', () => {
  it("uses the app's family on initialize, the User-Agent's otherwise, and always marks the health check", () => {
    expect(clientLabel('node', 'claude-ai')).toBe('claude');
    expect(clientLabel('node', 'John Smith')).toBe('node');
    expect(clientLabel('node', '1 Main St, Boston')).toBe('node');
    expect(clientLabel('node')).toBe('node');
    expect(clientLabel('subsola-health/1', 'claude-ai')).toBe('subsola-health');
  });
});

describe('methodLabel and protocolLabel', () => {
  it('keeps known methods and folds the rest', () => {
    expect(methodLabel('tools/call')).toBe('tools/call');
    expect(methodLabel('initialize')).toBe('initialize');
    expect(methodLabel('1 Main St, Boston')).toBe('other');
    expect(methodLabel(undefined)).toBe('invalid');
  });

  it('keeps only date-shaped protocol versions', () => {
    expect(protocolLabel('2025-06-18')).toBe('2025-06-18');
    expect(protocolLabel('1 Main St')).toBeNull();
    expect(protocolLabel(null)).toBeNull();
  });
});

describe('missFacts', () => {
  it('sorts lookup failures into outcomes', () => {
    expect(missFacts({ ok: false, reason: 'timeout' }, '1 Main St', 'nyc')).toEqual({
      outcome: 'upstream_error',
      region: 'nyc',
      missedPlace: null,
    });
    expect(missFacts({ ok: false, reason: 'data-unavailable', region: 'sea' }, 'x')).toMatchObject({
      outcome: 'upstream_error',
      region: 'sea',
    });
    expect(missFacts({ ok: false, reason: 'no-records', region: 'chi' }, 'x')).toMatchObject({
      outcome: 'no_records',
      region: 'chi',
    });
    expect(
      missFacts(
        { ok: false, reason: 'not-found', problem: { kind: 'other-state' } },
        '1 Main St, Boston, MA',
      ),
    ).toEqual({ outcome: 'outside_coverage', region: null, missedPlace: 'Boston, MA' });
    expect(
      missFacts(
        {
          ok: false,
          reason: 'not-found',
          problem: { kind: 'house-number', found: '190C MAIN ST', region: 'nyc' },
        },
        '100 Main St, NY',
      ),
    ).toEqual({ outcome: 'no_match', region: null, missedPlace: null });
    // Only a lookalike outside every city: the text decides.
    expect(
      missFacts(
        {
          ok: false,
          reason: 'not-found',
          problem: { kind: 'wrong-city', found: 'x', region: 'dc' },
        },
        '5 Elm St, Portland, OR',
      ),
    ).toMatchObject({ outcome: 'outside_coverage', missedPlace: 'Portland, OR' });
  });
});

describe('saveCall', () => {
  const call: CallRow = {
    at: 1_800_000_000,
    method: 'tools/call',
    tool: 'whats_under',
    region: 'nyc',
    outcome: 'answered',
    durationMs: 812,
    client: 'claude',
    protocol: '2025-06-18',
    missedPlace: null,
    requester: '0123456789ab',
    network: 'Anthropic, PBC',
    country: 'US',
  };
  const fakeDb = (fail = false) => {
    const batches: { sql: string; values: unknown[] }[][] = [];
    return {
      batches,
      db: {
        prepare: (sql: string) => ({ bind: (...values: unknown[]) => ({ sql, values }) }),
        batch: async (statements: { sql: string; values: unknown[] }[]) => {
          if (fail) throw new Error('D1 down');
          batches.push(statements);
        },
      },
    };
  };

  it('writes one row, and now and then sweeps rows past 90 days in the same batch', async () => {
    const { db, batches } = fakeDb();
    await saveCall(db, call, () => 0.5);
    await saveCall(db, call, () => 0.001);
    expect(batches[0]).toEqual([
      {
        sql: INSERT_CALL,
        values: [
          1_800_000_000,
          'tools/call',
          'whats_under',
          'nyc',
          'answered',
          812,
          'claude',
          '2025-06-18',
          null,
          '0123456789ab',
          'Anthropic, PBC',
          'US',
        ],
      },
    ]);
    expect(batches[1]![1]).toEqual({
      sql: PRUNE_CALLS,
      values: [1_800_000_000 - CALL_KEEP_SECONDS],
    });
  });

  it('never rejects when the write fails, and logs it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(saveCall(fakeDb(true).db, call)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
