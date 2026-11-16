import { z } from 'zod';
import { hmacSha256 } from '../hash';

/**
 * Who is calling /mcp, as far as the stats need: an anonymous ID and the network and country
 * Cloudflare reports. The ID is an HMAC of the IP under REQUESTER_KEY, cut short, so the same
 * caller groups together while the IP itself is never stored and can't be rebuilt from a guess
 * without the key. The key is not the limiter's salt, so the two hashes can't be joined.
 */

export interface Requester {
  requester: string | null;
  network: string | null;
  country: string | null;
}

/** Hex characters kept: 48 bits, plenty to tell callers apart, too short to mean anything else. */
export const REQUESTER_LENGTH = 12;
export const NETWORK_MAX = 80;

// Cloudflare puts these on request.cf; anything else there is ignored.
const cfSchema = z.object({
  asOrganization: z.string().optional().catch(undefined),
  country: z.string().optional().catch(undefined),
});

/** The org name of the caller's network ("Anthropic, PBC"), trimmed, or null. */
export const networkLabel = (value: string | undefined): string | null => {
  const trimmed = value?.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, NETWORK_MAX).trimEnd() : null;
};

/** A two-letter country code as Cloudflare gives it ("US", or "T1" for Tor), or null. */
export const countryLabel = (value: string | undefined): string | null => {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z][A-Z0-9]$/.test(code) ? code : null;
};

export const requesterId = async (key: string, ip: string) =>
  (await hmacSha256(key, ip)).slice(0, REQUESTER_LENGTH);

/**
 * What the stats row keeps about the caller. Never rejects: with no key or no IP the ID is null
 * and the call is still counted.
 */
export const requesterOf = async (
  request: Request,
  key: string | undefined,
): Promise<Requester> => {
  const cf = cfSchema.safeParse((request as Request & { cf?: unknown }).cf);
  const network = networkLabel(cf.success ? cf.data.asOrganization : undefined);
  const country = countryLabel(cf.success ? cf.data.country : undefined);
  const ip = request.headers.get('CF-Connecting-IP')?.trim();
  if (!key) {
    console.error('mcp stats: REQUESTER_KEY is not set');
    return { requester: null, network, country };
  }
  if (!ip) return { requester: null, network, country };
  try {
    return { requester: await requesterId(key, ip), network, country };
  } catch (error) {
    console.error('mcp stats: requester hash failed', error instanceof Error ? error.name : error);
    return { requester: null, network, country };
  }
};
