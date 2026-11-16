import { sha256 } from './hash';
import { z } from 'zod';

/**
 * The feedback form's server side. Every message passes a Cloudflare Turnstile check (no bots),
 * a size and shape check, and a per-visitor limit, and is stored as plain text with bound
 * parameters, never built into SQL or HTML. The handler takes its database and checks as
 * arguments so tests can stand in for Cloudflare.
 */

export const MESSAGE_MAX = 2000;
const EMAIL_MAX = 200;
const PAGE_MAX = 500;
const BODY_MAX_BYTES = 8 * 1024;
// A person writes a few notes an hour at most; past that it's a script.
const PER_HOUR = 5;

// Where the form lives. A post from anywhere else is someone else's page using ours.
const ORIGINS = [
  /^https:\/\/(www\.)?subsola\.com$/,
  /^https:\/\/([a-z0-9-]+\.)?subsola\.pages\.dev$/,
  /^http:\/\/localhost:\d+$/,
];

// Control characters other than tab and newline; nothing a person types.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const clean = (value: string) => value.replace(CONTROL, '').trim();

const bodySchema = z.object({
  message: z.string().transform(clean).pipe(z.string().min(3).max(MESSAGE_MAX)),
  email: z
    .string()
    .transform(clean)
    .pipe(z.union([z.literal(''), z.email().max(EMAIL_MAX)]))
    .optional(),
  page: z.string().transform(clean).pipe(z.string().max(PAGE_MAX)).optional(),
  turnstile: z.string().min(1).max(4096),
});

/** The two calls the handler makes to D1, so tests can replace them. */
export interface FeedbackStore {
  countSince: (visitor: string, sinceIso: string) => Promise<number>;
  insert: (row: {
    created_at: string;
    visitor: string;
    message: string;
    email: string | null;
    page: string | null;
    country: string | null;
  }) => Promise<void>;
}

export interface FeedbackDeps {
  store: FeedbackStore;
  /** Asks Turnstile whether the token is a real visitor's. */
  verify: (token: string, ip: string | null) => Promise<boolean>;
  /** A secret mixed into the visitor hash, so stored hashes can't be matched to IPs. */
  salt: string;
  now?: () => Date;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export const handleFeedback = async (request: Request, deps: FeedbackDeps): Promise<Response> => {
  if (request.method !== 'POST') return json(405, { error: 'Use POST' });
  const origin = request.headers.get('Origin') ?? '';
  if (!ORIGINS.some((allowed) => allowed.test(origin))) return json(403, { error: 'Not allowed' });
  if (!(request.headers.get('Content-Type') ?? '').startsWith('application/json'))
    return json(415, { error: 'Send JSON' });

  const text = await request.text();
  if (new TextEncoder().encode(text).length > BODY_MAX_BYTES)
    return json(413, { error: 'Too long' });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json(400, { error: 'Not JSON' });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json(400, { error: 'Check the message and email' });
  const body = parsed.data;

  const ip = request.headers.get('CF-Connecting-IP');
  if (!(await deps.verify(body.turnstile, ip)))
    return json(403, { error: "Couldn't confirm you're not a bot. Try again." });

  const now = deps.now?.() ?? new Date();
  const visitor = await sha256(`${deps.salt}|${ip ?? 'unknown'}`);
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  if ((await deps.store.countSince(visitor, hourAgo)) >= PER_HOUR)
    return json(429, { error: 'That is a lot of feedback for one hour. Try again later.' });

  await deps.store.insert({
    created_at: now.toISOString(),
    visitor,
    message: body.message,
    email: body.email || null,
    page: body.page || null,
    country: request.headers.get('CF-IPCountry'),
  });
  return json(200, { ok: true });
};

/** Turnstile's server check. */
export const verifyTurnstile =
  (secret: string) =>
  async (token: string, ip: string | null): Promise<boolean> => {
    const form = new FormData();
    form.set('secret', secret);
    form.set('response', token);
    if (ip) form.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    if (!res.ok) return false;
    const result = (await res.json()) as { success?: boolean };
    return result.success === true;
  };
