import { describe, expect, it } from 'vitest';
import { privacyPage } from './privacy';
import { pageFiles } from './build';
import { CONTACT_EMAIL, OPERATOR } from '../site';

describe('privacy page', () => {
  const html = privacyPage('assets/pages.css');

  it('is built beside the other pages, at /privacy', () => {
    expect(pageFiles('assets/pages.css', {})['privacy.html']).toBe(html);
    expect(html).toContain('<link rel="canonical" href="https://subsola.com/privacy" />');
  });

  it('covers each part of the site and points questions to the shared inbox and the feedback form', () => {
    for (const id of ['map', 'analytics', 'feedback', 'mcp', 'hosting', 'contact'])
      expect(html).toContain(`id="${id}"`);
    expect(html).toContain('href="/?sel=feedback"');
    expect(html).toContain('kept for 2 days, then deleted');
    expect(html).toContain('Rows are deleted after 90 days');
    expect(html).toContain('never the address');
    expect(html).toContain('anonymous requester ID');
    expect(html).toContain('the IP itself is never stored');
    expect(html).toContain('the name of the network the call came from');
    expect(html).toContain(`mailto:${CONTACT_EMAIL}`);
    // The shared inbox only: no one's own address.
    expect(html.replaceAll(CONTACT_EMAIL, '')).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    expect(html).not.toContain(String.fromCharCode(0x2014));
  });

  it('names the company that runs Subsola, where notes go, and whom to ask', () => {
    expect(OPERATOR).toBe('Central Park Labs, LLC');
    expect(html).toContain('Subsola is run by Central Park Labs, LLC');
    expect(html).toContain('Notes go to Central Park Labs, LLC');
    expect(html).toContain('Email Central Park Labs, LLC at');
    expect(html).not.toContain('the person who runs');
  });
});
