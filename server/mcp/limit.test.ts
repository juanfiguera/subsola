import { describe, expect, it, vi } from 'vitest';
import { LIMITS, checkLimit, type CountHits } from './limit';

const request = (ip: string) =>
  new Request('https://subsola.com/mcp', { method: 'POST', headers: { 'CF-Connecting-IP': ip } });

/** An in-memory stand-in for the D1 table. */
const memoryCounter = () => {
  const counts = new Map<string, number>();
  const count: CountHits = async (counters) =>
    counters.map(({ key, bucket }) => {
      const id = `${key}@${bucket}`;
      const n = (counts.get(id) ?? 0) + 1;
      counts.set(id, n);
      return n;
    });
  return { counts, count };
};

const perMinute = LIMITS.find((limit) => limit.name === 'visitor-minute')!.max;

describe('checkLimit', () => {
  it('answers up to the per-minute limit, then says how long to wait', async () => {
    const { count } = memoryCounter();
    const now = () => new Date('2026-11-10T05:00:15Z');
    const deps = { count, salt: 's', now };
    for (let i = 0; i < perMinute; i++)
      expect(await checkLimit(request('1.2.3.4'), deps)).toBeNull();
    expect(await checkLimit(request('1.2.3.4'), deps)).toBe(45);
    // Another address has its own count.
    expect(await checkLimit(request('5.6.7.8'), deps)).toBeNull();
  });

  it('never stores the IP itself', async () => {
    const { counts, count } = memoryCounter();
    await checkLimit(request('1.2.3.4'), { count, salt: 's', now: () => new Date() });
    expect([...counts.keys()].join(' ')).not.toContain('1.2.3.4');
  });

  it('answers when counting fails, and says so in the log', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const count: CountHits = () => Promise.reject(new Error('D1 down'));
    expect(
      await checkLimit(request('1.2.3.4'), { count, salt: 's', now: () => new Date() }),
    ).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
