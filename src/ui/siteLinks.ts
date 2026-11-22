import { CONTACT_NAV, REPO_URL } from '../site';
import { SOURCES } from '../sources/catalog';

/**
 * About, the other pages and a contact link, in one quiet row: in the map's bottom corner on
 * a wide screen, and at the foot of the card on a phone, where the corner is taken by the sheet.
 * About opens the About card; the rest are plain links.
 */
export const siteLinks = (where: 'corner' | 'card') => `
  <nav class="site-links site-links-${where}" aria-label="About Subsola">
    <button class="link" data-action="about">About</button>
    <a href="/insights">Insights</a>
    <a href="/mcp" data-mcp-link="${where === 'corner' ? 'site links' : 'card links'}">${where === 'corner' ? 'MCP' : 'Use with AI assistants'}</a>
    <a href="/faq">FAQ</a>
    <a href="/credits">Credits</a>
    <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>
    <a href="/privacy">Privacy</a>
    ${CONTACT_NAV}
  </nav>`;

/**
 * The OpenStreetMap credit ODbL asks for wherever its data is shown. It sits apart from
 * Subsola's own links, worded as a data credit, so it can't read as whose product this is. Only
 * New York's street features come from OpenStreetMap today, but the city map's basemap is
 * OpenStreetMap data in every city, so it shows everywhere.
 */
export const mapCredit = (where: 'corner' | 'card') =>
  `<p class="map-credit map-credit-${where}">Map data © <a href="${SOURCES.osm.url}" target="_blank" rel="noopener">OpenStreetMap</a> contributors</p>`;
