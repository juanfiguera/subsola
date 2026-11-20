import { REGIONS, cityNames, type Region } from '../regions';
import { escapeHtml } from './dom';

/**
 * What the card says when a search lands nowhere Subsola can show: an address outside the cities
 * it covers, or one inside a city that the records don't reach yet. Worded like the MCP server's
 * misses (server/mcp/misses.ts): what went wrong, what Subsola covers, and how to ask again,
 * so a person never stares at an empty street wondering if it's clear.
 */
export type CoverageMiss =
  /** No city's geocoder knew the address. */
  | { kind: 'not-found'; typed: string }
  /** The address names a state or ZIP code outside the covered cities. */
  | { kind: 'other-state'; typed: string }
  /** The address names a place that isn't one of the covered cities or their neighborhoods. */
  | { kind: 'unknown-place'; typed: string; place: string }
  /** Found inside a city, but the nightly build has no records for that street. */
  | { kind: 'no-records'; address: string; region: Region };

const HOW_TO_FIX =
  'Search a house number, street and city, like 25-87 37th St, Queens, or 800 F St NW, Washington, DC, or open the city map and zoom in on a street.';

export const coverageMessage = (miss: CoverageMiss): { title: string; text: string } => {
  switch (miss.kind) {
    case 'not-found':
      return {
        title: "Can't find that address",
        text: `Couldn't find "${miss.typed}" in ${cityNames('or')}. ${HOW_TO_FIX}`,
      };
    case 'other-state':
      return {
        title: 'Outside the cities Subsola maps',
        text: `"${miss.typed}" names a state or ZIP code outside ${cityNames('and')}, which are the only places Subsola covers. Search an address in one of them, or open the city map.`,
      };
    case 'unknown-place':
      return {
        title: 'Outside the cities Subsola maps',
        text: `"${miss.place}" isn't one of the cities Subsola covers (${cityNames('and')}), so "${miss.typed}" wasn't looked up elsewhere. If the address is in a covered city, name that city or borough instead.`,
      };
    case 'no-records':
      return {
        title: 'No records for this street yet',
        text: `Found ${miss.address} in ${miss.region.name}, but Subsola's records don't reach that street yet, so nothing is drawn. That doesn't mean the street is clear. Try a nearby street, or open the city map to see where lines are mapped.`,
      };
  }
};

/** The card for a miss, with a way back to the street that was showing, if any. */
export const coverageCard = (miss: CoverageMiss, backTo: string | null) => {
  const { title, text } = coverageMessage(miss);
  const covered = REGIONS.map((region) => region.name);
  return `
    <span class="hood">Search</span>
    <h1 class="card-title">${escapeHtml(title)}</h1>
    <p class="hero-line">${escapeHtml(text)}</p>
    <div class="coverage-actions">
      <button class="pill pill-ink" data-action="open-city">Open the city map</button>
      ${backTo ? `<button class="pill" data-action="back">Back to ${escapeHtml(backTo)}</button>` : ''}
    </div>
    <section class="card-section">
      <h2>Subsola maps</h2>
      <ul class="coverage-cities">${covered.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}</ul>
    </section>
    <p class="fine">Planning to dig anywhere? Call 811 first: it's free, and it's the law.</p>`;
};
