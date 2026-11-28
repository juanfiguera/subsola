import { afterEach, describe, expect, it, vi } from 'vitest';
import { startErrorReporting, withoutQuery, withoutQuoted } from './errors';

const { startSentry } = vi.hoisted(() => ({ startSentry: vi.fn() }));
vi.mock('./sentry', () => ({ startSentry }));

describe('error report scrubbing', () => {
  it('drops the address from URLs and messages', () => {
    expect(withoutQuery('https://subsola.com/?q=12+Main+St&cam=40.7,-73.9')).toBe(
      'https://subsola.com/',
    );
    expect(withoutQuoted('[subsola] Couldn\'t find "12 Main St" in New York City')).toBe(
      '[subsola] Couldn\'t find "…" in New York City',
    );
  });
});

describe('startErrorReporting', () => {
  const consoleError = console.error;
  afterEach(() => {
    console.error = consoleError;
    vi.unstubAllGlobals();
  });

  it('sends what was logged before Sentry loaded, then stops holding logs', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const logged = vi.fn();
    console.error = logged;
    startErrorReporting('https://key@o1.ingest.sentry.io/1');
    console.error('[subsola] the last page load ended without closing', 'at stage: diving');
    await vi.waitFor(() => expect(startSentry).toHaveBeenCalled());
    expect(startSentry).toHaveBeenCalledWith(
      'https://key@o1.ingest.sentry.io/1',
      [],
      ['[subsola] the last page load ended without closing at stage: diving'],
    );
    expect(logged).toHaveBeenCalledTimes(1);
    expect(console.error).toBe(logged);
  });
});
