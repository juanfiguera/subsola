import { KEEP_SECONDS } from '../../server/mcp/limit';
import { CALL_KEEP_SECONDS } from '../../server/mcp/callLog';
import { CONTACT_LINK, OPERATOR, SITE_NAME } from '../site';
import { page } from './layout';

/**
 * subsola.com/privacy: what the site, the feedback form, analytics and the MCP server keep, in
 * plain words. Every claim here is something the code does: src/analytics.ts, src/errors.ts,
 * src/ui/feedback.ts with server/feedback.ts and migrations/0001_feedback.sql, and server/mcp
 * (calls.ts and migrations/0003_mcp_calls.sql for its stats).
 * Change this page when any of those change.
 */

const days = (seconds: number) => {
  const count = seconds / 86_400;
  return count === 1 ? 'one day' : `${count} days`;
};

const section = (id: string, title: string, items: string[]) => `
      <section class="block" aria-labelledby="${id}">
        <h2 id="${id}">${title}</h2>
        <ul class="plain-list">${items.map((item) => `<li>${item}</li>`).join('')}</ul>
      </section>`;

export const privacyPage = (stylesheet: string) =>
  page(
    {
      title: `Privacy | ${SITE_NAME}`,
      description: `What ${SITE_NAME} keeps about you, and what it never stores: the map, the feedback form, analytics and the MCP server.`,
      path: '/privacy',
      stylesheet,
    },
    `<header class="intro">
        <p class="kicker">Privacy</p>
        <h1>What ${SITE_NAME} keeps</h1>
        <p class="lede">Very little. There are no accounts, and the addresses you look up are never stored by ${SITE_NAME}. Here is everything, part by part.</p>
        <p>${SITE_NAME} is run by ${OPERATOR}, which is responsible for what this page describes.</p>
      </header>
      ${section('map', 'The map', [
        'When you type an address, your browser sends it straight to that city’s own address lookup (the city or county geocoder) to find it. Those services have their own policies.',
        'As you type, suggestions send what you have typed so far to that city’s address lookup (the city on the map and New York, or a city you name), so it can list matching addresses.',
        'Map tiles, aerial photos and city open data load from their publishers’ servers, and the street data from Subsola’s own file server. They see the request like any website does.',
        'A shared link carries the address in the link itself (<code>?q=...</code>). Nobody gets it unless you share the link.',
        'The map sets no cookies. It keeps two small notes in your browser’s storage: whether you have seen the welcome guide, and how far a page load got, so a load that crashed can be reported on your next visit (stages only, never an address).',
      ])}
      ${section('analytics', 'Analytics and error reports', [
        'Product analytics run on PostHog, set up to know no one: nothing is stored on your device, there are no profiles or session recordings, and the project discards IP addresses.',
        'Events say what was done and in which city ("address searched", "report opened"), never the address or the spot you looked at. Page addresses are sent without the part that holds the address.',
        'Errors are reported to Sentry with the same care: addresses are cut from page links and messages before a report leaves your browser, and Sentry is told not to keep IPs or cookies.',
        'Cloudflare, which hosts the site, can count page views with its own Web Analytics, which uses no cookies.',
      ])}
      ${section('feedback', 'The feedback form', [
        'A note you send is stored with the email you give (if any), the page you were on (which can include the address you were looking at), your country as Cloudflare reports it, and the time.',
        'To limit how much one sender can post, your IP address is combined with a secret and hashed. Only the hash is kept, never the IP itself.',
        'Cloudflare Turnstile checks that a person is sending the note. It runs only when you open the form.',
        `Notes go to ${OPERATOR}, which runs ${SITE_NAME}, and nowhere else. They are kept until deleted by hand; to have yours removed, say so in a note.`,
      ])}
      ${section('mcp', 'The MCP server for AI assistants', [
        'Addresses asked about through <a href="/mcp">subsola.com/mcp</a> are never stored or logged. As on the map, the address goes to the city’s address lookup to be found.',
        `For each call, the server keeps a stats row: which tool was used, which city the answer was for, how it ended (answered, not found, outside the covered cities, an error), how long it took, the name of the app that connected (such as Claude or Cursor) and the protocol version. When an address is outside the covered cities, the row keeps the city or state Subsola recognized in it (such as "Boston, MA"), never the address.`,
        'Each row also keeps an anonymous requester ID, so repeat use can be counted. It is made by scrambling your IP address with a secret key; the IP itself is never stored, and the ID can’t be turned back into it. The row also keeps the name of the network the call came from (a company or an internet provider, such as "Comcast Cable") and the country, as Cloudflare reports them.',
        `Rows are deleted after ${days(CALL_KEEP_SECONDS)}. They never hold the address you asked about, your IP address, your name or any way to reach you.`,
        'Beyond those rows, the server logs counts and error names only.',
        `To enforce its limits, each connection’s IP address is hashed with a secret, and the hash and a count per minute and per day are kept for ${days(KEEP_SECONDS)}, then deleted.`,
      ])}
      ${section('hosting', 'Hosting', [
        'Subsola runs on Cloudflare, which processes every request and keeps its own logs under <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare’s privacy policy</a>.',
        'Fonts load from Google Fonts.',
      ])}
      <section class="block" aria-labelledby="contact">
        <h2 id="contact">Questions</h2>
        <p>Email ${OPERATOR} at ${CONTACT_LINK}, or use the <a href="/?sel=feedback">feedback form</a> on the map.</p>
      </section>`,
  );
