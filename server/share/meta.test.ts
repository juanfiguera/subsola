import { describe, expect, it } from 'vitest';
import { shareMeta, streetImageUrl, streetLine } from './meta';

// 117 West St, as "Copy link" writes it.
const SHARED =
  '?q=117%20West%20St%2C%20New%20York%2C%20NY%2010007&cam=40.7130112,-74.013175,1.5,35,-20&sel=utility:gas';

describe('streetLine', () => {
  it('keeps the street part of an address, tidied the way the map writes it', () => {
    expect(streetLine('117 West Street, New York, NY 10007')).toBe('117 West St');
    expect(streetLine('800 F St NW, Washington, DC')).toBe('800 F St NW');
    expect(streetLine('25-87 37 STREET, Astoria')).toBe('25-87 37th St');
  });

  it('drops characters an address has no use for', () => {
    expect(streetLine('"><script>alert(1)</script>')).toBe('Script Alert 1 /Script');
    expect(streetLine('1 Main St <b>&amp;</b>')).toBe('1 Main St B Amp /B');
    expect(streetLine('<>"{}')).toBeNull();
    expect(streetLine('')).toBeNull();
  });

  it('caps the length at a word', () => {
    const long = streetLine(`1 ${'Verylongname '.repeat(10)}St`)!;
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith('Verylongname')).toBe(true);
  });
});

describe('shareMeta', () => {
  it('names the street and the city its camera is in', () => {
    const meta = shareMeta(SHARED)!;
    expect(meta.title).toBe("117 West St, New York City: what's under the street");
    expect(meta.description).toContain('likely under 117 West St, New York City');
    expect(meta.description).toContain('call 811 before you dig');
    expect(meta.image).toBe(
      'https://subsola.com/og/street?at=40.71301,-74.01318&q=117%20West%20St',
    );
    expect(meta.imageAlt).toContain('117 West St, New York City');
  });

  it('rebuilds the link from what it understood, dropping anything else', () => {
    const meta = shareMeta(`${SHARED}&utm_source=x&cam2=<script>`)!;
    expect(meta.url).toBe(
      'https://subsola.com/?q=117%20West%20St%2C%20New%20York%2C%20NY%2010007&cam=40.7130112,-74.013175,1.5,35,-20&sel=utility:gas',
    );
  });

  it('finds the city from the address when the link has no camera', () => {
    const meta = shareMeta('?q=1420%205th%20Ave%2C%20Seattle')!;
    expect(meta.title).toBe("1420 5th Ave, Seattle: what's under the street");
    // No spot to draw, so the site's own picture.
    expect(meta.image).toBe('https://subsola.com/og.png');
  });

  it('leaves the city out when nothing says which', () => {
    expect(shareMeta('?q=117%20West%20St')!.title).toBe("117 West St: what's under the street");
  });

  it('leaves the page alone without an address', () => {
    expect(shareMeta('')).toBeNull();
    expect(shareMeta('?cam=40.71,-74.01,1,35,0')).toBeNull();
    expect(shareMeta('?q=%3C%3E')).toBeNull();
  });

  it('never lets markup through', () => {
    const meta = shareMeta('?q=%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E')!;
    for (const value of [meta.title, meta.description, meta.imageAlt, meta.image])
      expect(value).not.toMatch(/[<>"]/);
  });
});

describe('streetImageUrl', () => {
  it('rounds the spot so nearby views share one cached picture', () => {
    expect(streetImageUrl([-74.0131751, 40.7130112], 'West St')).toBe(
      'https://subsola.com/og/street?at=40.71301,-74.01318&q=West%20St',
    );
  });
});
