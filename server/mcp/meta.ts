import { cityNames } from '../../src/regions';
import { SERVER_VERSION } from './changelog';
import { MCP_URL } from './clients';

/**
 * Who the server says it is, in one place: the initialize and discover results, the server card,
 * the registry's server.json and the docs page all read from here. The version is the server's
 * own (tools, inputs, answers), from the newest changelog entry, not the protocol's.
 */

export const SITE_URL = 'https://subsola.com';
export const SERVER_NAME = 'subsola';
export const SERVER_TITLE = 'Subsola';
/** The server's name in the MCP Registry and on its server card: reverse DNS of subsola.com. */
export const REGISTRY_NAME = 'com.subsola/subsola';

/** At most 100 characters: the registry and the server card cap it there. */
export const SERVER_DESCRIPTION =
  'What public records say is under US city streets: utilities, depths, lead lines and digs.';

/** The site's own icons, as protocol 2025-11-25 describes them. */
export const SERVER_ICONS = [
  { src: `${SITE_URL}/favicon.svg`, mimeType: 'image/svg+xml', sizes: ['any'] },
  { src: `${SITE_URL}/apple-touch-icon.png`, mimeType: 'image/png', sizes: ['180x180'] },
  { src: `${SITE_URL}/favicon-32.png`, mimeType: 'image/png', sizes: ['32x32'] },
];

/** Implementation as 2025-06-18 and earlier define it: name, title and version. */
export const BASE_SERVER_INFO = { name: SERVER_NAME, title: SERVER_TITLE, version: SERVER_VERSION };

/** Implementation from 2025-11-25 on, which adds a description, a website and icons. */
export const FULL_SERVER_INFO = {
  ...BASE_SERVER_INFO,
  description: SERVER_DESCRIPTION,
  websiteUrl: MCP_URL,
  icons: SERVER_ICONS,
};

/**
 * What a client may show its model about the server: what it knows and where answers come from.
 * It doesn't tell the assistant how to behave beyond the tools (Claude's connector review rules
 * that out).
 */
export const instructions = () =>
  `Subsola answers from public records what is likely under the streets of ${cityNames('and')}: the utilities in the street in front of an address and their expected depths, the water service line's lead status where the city publishes it, and recent utility excavation permits. Records are rebuilt nightly and each answer gives its records-as-of date. Answers are public-records evidence, not a survey or a utility locate, and each ends with the city's 811 notice and link.`;
