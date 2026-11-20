import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The browser fetches from these files directly, so every host they name has to be in the
// site's connect-src, or the production site blocks the call while the dev server, which sends
// no CSP, works fine. Dallas's address lookup shipped blocked that way on 2026-11-20.
const DIR = 'src/sources';
const FETCHERS = readdirSync(DIR).filter(
  (name) =>
    name.endsWith('.ts') &&
    !name.endsWith('.test.ts') &&
    /fetch\(/.test(readFileSync(join(DIR, name), 'utf8')),
);
const connectSrc = /connect-src([^;]*)/.exec(readFileSync('public/_headers', 'utf8'))?.[1] ?? '';

describe('connect-src', () => {
  it.each(FETCHERS)('allows every host %s names', (name) => {
    const hosts = new Set(
      readFileSync(join(DIR, name), 'utf8').match(/https:\/\/[a-z0-9.-]+/g) ?? [],
    );
    const allowed = connectSrc.split(/\s+/);
    expect([...hosts].filter((host) => !allowed.includes(host))).toEqual([]);
  });
});
