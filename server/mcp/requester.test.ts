import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NETWORK_MAX,
  REQUESTER_LENGTH,
  countryLabel,
  networkLabel,
  requesterId,
  requesterOf,
} from './requester';

const IP = '203.0.113.42';
const KEY = 'test-requester-key';

/** A request as Cloudflare hands it over: the IP in a header, network and country on cf. */
const request = (ip: string | null, cf?: unknown) => {
  const req = new Request('https://subsola.com/mcp', {
    method: 'POST',
    headers: ip === null ? {} : { 'CF-Connecting-IP': ip },
  });
  if (cf !== undefined) Object.defineProperty(req, 'cf', { value: cf });
  return req;
};

afterEach(() => vi.restoreAllMocks());

describe('requesterId', () => {
  it('is short hex, stable for the same IP and key', async () => {
    const id = await requesterId(KEY, IP);
    expect(id).toMatch(new RegExp(`^[0-9a-f]{${REQUESTER_LENGTH}}$`));
    expect(await requesterId(KEY, IP)).toBe(id);
  });

  it('changes with the key and with the IP', async () => {
    const id = await requesterId(KEY, IP);
    expect(await requesterId('another-key', IP)).not.toBe(id);
    expect(await requesterId(KEY, '203.0.113.43')).not.toBe(id);
  });

  it('never contains the IP or any of its parts', async () => {
    for (const ip of [IP, '2001:db8::1', '10.0.0.1']) {
      const id = await requesterId(KEY, ip);
      expect(id).not.toContain(ip);
      expect(id).not.toContain(ip.replace(/[.:]/g, ''));
    }
  });
});

describe('networkLabel', () => {
  it('trims and keeps at most 80 characters', () => {
    expect(networkLabel('  Anthropic, PBC ')).toBe('Anthropic, PBC');
    expect(networkLabel('Comcast\n  Cable')).toBe('Comcast Cable');
    const long = networkLabel(`${'A'.repeat(79)} ${'B'.repeat(20)}`);
    expect(long).toBe('A'.repeat(79));
    expect(networkLabel('x'.repeat(200))).toHaveLength(NETWORK_MAX);
  });

  it('is null when Cloudflare gives none', () => {
    expect(networkLabel(undefined)).toBeNull();
    expect(networkLabel('')).toBeNull();
    expect(networkLabel('   ')).toBeNull();
  });
});

describe('countryLabel', () => {
  it('keeps a two-letter code', () => {
    expect(countryLabel('US')).toBe('US');
    expect(countryLabel('ie')).toBe('IE');
    expect(countryLabel('T1')).toBe('T1');
  });

  it('is null for anything else', () => {
    expect(countryLabel(undefined)).toBeNull();
    expect(countryLabel('')).toBeNull();
    expect(countryLabel('USA')).toBeNull();
    expect(countryLabel('1')).toBeNull();
  });
});

describe('requesterOf', () => {
  it('reads the ID, network and country from the request', async () => {
    const who = await requesterOf(
      request(IP, { asOrganization: 'Anthropic, PBC', country: 'US', colo: 'EWR' }),
      KEY,
    );
    expect(who).toEqual({
      requester: await requesterId(KEY, IP),
      network: 'Anthropic, PBC',
      country: 'US',
    });
    expect(JSON.stringify(who)).not.toContain(IP);
  });

  it('has nulls where the request has nothing, and never throws on an odd cf', async () => {
    expect(await requesterOf(request(null), KEY)).toEqual({
      requester: null,
      network: null,
      country: null,
    });
    expect(await requesterOf(request(IP, { asOrganization: 42, country: ['US'] }), KEY)).toEqual({
      requester: await requesterId(KEY, IP),
      network: null,
      country: null,
    });
    expect((await requesterOf(request(IP, 'nonsense'), KEY)).network).toBeNull();
  });

  it('stores no ID without a key, and says so in the log', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const who = await requesterOf(request(IP, { country: 'US' }), undefined);
    expect(who).toEqual({ requester: null, network: null, country: 'US' });
    expect(error).toHaveBeenCalledWith('mcp stats: REQUESTER_KEY is not set');
  });
});
