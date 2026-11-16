import { describe, expect, it } from 'vitest';
import { handleFeedback, type FeedbackDeps } from './feedback';

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://subsola.com/api/feedback', {
    method: 'POST',
    headers: {
      Origin: 'https://subsola.com',
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.7',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const deps = (overrides: Partial<FeedbackDeps> = {}) => {
  const rows: Parameters<FeedbackDeps['store']['insert']>[0][] = [];
  const all: FeedbackDeps = {
    salt: 'test-salt',
    verify: async () => true,
    store: {
      countSince: async (visitor) => rows.filter((row) => row.visitor === visitor).length,
      insert: async (row) => {
        rows.push(row);
      },
    },
    ...overrides,
  };
  return { deps: all, rows };
};

const good = { message: 'The sewer on my street is missing.', turnstile: 'token' };

describe('handleFeedback', () => {
  it('stores a message as plain text, with a hash in place of the IP', async () => {
    const { deps: d, rows } = deps();
    const res = await handleFeedback(
      post({ ...good, message: "<script>alert(1)</script>'; DROP TABLE feedback;--" }),
      d,
    );
    expect(res.status).toBe(200);
    expect(rows[0]?.message).toBe("<script>alert(1)</script>'; DROP TABLE feedback;--");
    expect(rows[0]?.visitor).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows[0])).not.toContain('203.0.113.7');
  });

  it('turns away a bot that fails Turnstile', async () => {
    const { deps: d, rows } = deps({ verify: async () => false });
    expect((await handleFeedback(post(good), d)).status).toBe(403);
    expect(rows).toHaveLength(0);
  });

  it("turns away another site's page posting to us", async () => {
    const { deps: d } = deps();
    expect((await handleFeedback(post(good, { Origin: 'https://evil.example' }), d)).status).toBe(
      403,
    );
  });

  it('limits one sender to a few messages an hour', async () => {
    const { deps: d, rows } = deps();
    for (let i = 0; i < 5; i++) await handleFeedback(post(good), d);
    expect((await handleFeedback(post(good), d)).status).toBe(429);
    expect(rows).toHaveLength(5);
    // Someone else isn't held back by them.
    expect(
      (await handleFeedback(post(good, { 'CF-Connecting-IP': '198.51.100.2' }), d)).status,
    ).toBe(200);
  });

  it('rejects empty, oversized and malformed bodies', async () => {
    const { deps: d } = deps();
    expect((await handleFeedback(post({ ...good, message: ' ' }), d)).status).toBe(400);
    expect((await handleFeedback(post({ ...good, message: 'x'.repeat(2001) }), d)).status).toBe(
      400,
    );
    expect((await handleFeedback(post({ ...good, email: 'not an email' }), d)).status).toBe(400);
    expect((await handleFeedback(post('{not json'), d)).status).toBe(400);
    expect((await handleFeedback(post('x'.repeat(9000)), d)).status).toBe(413);
    expect((await handleFeedback(post(good, { 'Content-Type': 'text/plain' }), d)).status).toBe(
      415,
    );
  });

  it('strips control characters', async () => {
    const { deps: d, rows } = deps();
    await handleFeedback(post({ ...good, message: 'Hello\u0000\u0007 there' }), d);
    expect(rows[0]?.message).toBe('Hello there');
  });
});
