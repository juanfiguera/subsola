/**
 * How Subsola names itself in the generated pages and share previews. index.html and
 * insights.html carry the same wording in their own head tags, without city names, so neither
 * goes stale as cities are added; lists of cities come from REGIONS.
 */

export const SITE_URL = 'https://subsola.com';
export const SITE_NAME = 'Subsola';
/** The company that runs Subsola, as the privacy page and directory listings name it. */
export const OPERATOR = 'Central Park Labs, LLC';
/** Forwarded by Cloudflare Email Routing, so no one's own address goes on the site. */
export const CONTACT_EMAIL = 'hello@subsola.com';
/** Subsola is open source (AGPL); index.html links here too, in the top bar. */
export const REPO_URL = 'https://github.com/juanfiguera/subsola';
/**
 * Cloudflare's email obfuscation would swap the address for a link only its own script can decode,
 * and the /mcp page's nonce-only CSP blocks that script, so these comments turn it off.
 */
export const CONTACT_LINK = `<!--email_off--><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a><!--/email_off-->`;
export const SHARE_IMAGE = `${SITE_URL}/og.png`;
export const SHARE_IMAGE_ALT =
  'A street cut open to show water, sewer, gas, electric and telecom lines below it.';
