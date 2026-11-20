import { citySlug, REGIONS, type Region } from '../regions';
import { isPaused, pausedNote, SOURCES, type SourceKey } from '../sources/catalog';
import { sharedViewSearch } from '../share';
import { escapeHtml } from '../ui/dom';
import { SITE_NAME, SITE_URL } from '../site';
import { CITY_FACTS, type CityFigures } from './cities';
import { page } from './layout';

/**
 * One page per city, at subsola.com/<city-slug>: what the map shows there and where it comes
 * from, for people searching "Seattle sewer map" who have never heard of Subsola. Everything
 * specific is read from the region, the source catalog and the nightly figures.
 */

export const cityPath = (region: Region) => `/${citySlug(region)}`;

export const cityTitle = (region: Region) => `${region.name} underground utility map`;

const list = (items: string[]) => new Intl.ListFormat('en', { type: 'conjunction' }).format(items);

const count = (value: number) => Math.round(value).toLocaleString('en-US');

/** "Seattle Public Utilities' <i>Sewer mains</i> and <i>Water mains</i>". */
const sourceNames = (keys: SourceKey[]) => {
  const byPublisher = new Map<string, string[]>();
  for (const key of keys) {
    const { name, publisher } = SOURCES[key];
    byPublisher.set(publisher, [...(byPublisher.get(publisher) ?? []), name]);
  }
  return list(
    [...byPublisher].map(
      ([publisher, names]) =>
        `${escapeHtml(publisher)}${publisher.endsWith('s') ? '\u2019' : '\u2019s'} ${list(names.map((name) => `<i>${escapeHtml(name)}</i>`))}`,
    ),
  );
};

const sourceItem = (key: SourceKey) => {
  const { name, publisher, url, license } = SOURCES[key];
  return `<li><a href="${escapeHtml(url)}" rel="noopener">${escapeHtml(name)}</a><span>${escapeHtml(publisher)}. ${escapeHtml(license)}.</span></li>`;
};

const mapLink = (address: string | null) =>
  address ? `/${sharedViewSearch({ address, camera: null, pick: null, since: null })}` : '/';

const milesLine = (figures: CityFigures | undefined) => {
  const entries = Object.entries(figures?.miles ?? {}).filter(
    (entry): entry is [string, number] => (entry[1] ?? 0) > 0,
  );
  if (!entries.length) return '';
  // Not every mapped layer is counted in insights.json, so this says "includes", not "in all".
  const noun = (utility: string) => (utility === 'water' ? 'water main' : utility);
  return ` That includes ${list(entries.map(([utility, miles]) => `<b>${count(miles)}</b> miles of ${escapeHtml(noun(utility))}`))}.`;
};

const leadSection = (region: Region, figures: CityFigures | undefined) => {
  const facts = CITY_FACTS[region.id];
  if (!facts) return '';
  const lead = figures?.lead;
  const counted =
    facts.serviceLines && lead
      ? ` Of the <b>${count(lead.total)}</b> ${escapeHtml(lead.unit)} in it, <b>${count(lead.lead)}</b> are listed as lead.`
      : '';
  const paused = facts.serviceLines ? pausedNote(facts.serviceLines) : null;
  return `<section class="block" aria-labelledby="lead-title">
        <h2 id="lead-title">Lead service lines</h2>
        <p>${escapeHtml(facts.serviceLineNote)}${paused ? ` ${escapeHtml(paused)}` : counted}</p>
      </section>`;
};

const sourcesSection = (region: Region) => {
  const facts = CITY_FACTS[region.id];
  if (!facts) return '';
  const keys = [
    ...facts.permits,
    ...facts.mains,
    ...(facts.serviceLines ? [facts.serviceLines] : []),
  ].filter((key) => !isPaused(key));
  return `<section class="block" aria-labelledby="sources-title">
        <h2 id="sources-title">Sources</h2>
        <ul class="sources">${keys.map(sourceItem).join('')}</ul>
        <p class="note">${escapeHtml(facts.alsoDraws ?? "The map also draws hydrants, inlets, street lights and signals, and streets and buildings, from the city's open data.")} Every card on the map names the record it came from.</p>
      </section>`;
};

const whereSection = (region: Region, figures: CityFigures | undefined) => {
  const facts = CITY_FACTS[region.id];
  if (!facts) return '';
  const since = figures?.permitsSince
    ? `, with steady records from <b>${figures.permitsSince}</b> on`
    : '';
  const mains = facts.mains.length
    ? `<p>Where the city or a utility maps its own lines, they're drawn on those routes, from ${sourceNames(facts.mains)}.${milesLine(figures)} ${escapeHtml(facts.unmapped)}</p>`
    : `<p>${escapeHtml(facts.unmapped)}</p>`;
  return `<section class="block" aria-labelledby="where-title">
        <h2 id="where-title">Where the lines come from</h2>
        <p>Street permits show which utility dug on which block. Subsola reads ${sourceNames(facts.permits)}${since}. ${escapeHtml(region.privateOwners)} don't publish where their lines run, so their gas, electric and telecom lines are placed on the blocks those permits name, at the depths the codes require. Each line on the map says how it was placed and how sure that is.</p>
        ${mains}
      </section>`;
};

/** A city in a list of cities, its beta label inside the link so the two read as one. */
export const cityLink = (region: Region) =>
  `<li><a href="${cityPath(region)}">${escapeHtml(region.name)}${region.beta ? ' <span class="tag">Beta</span>' : ''}</a></li>`;

const otherCities = (region: Region) =>
  REGIONS.filter((other) => other !== region)
    .map(cityLink)
    .join('');

export const cityDescription = (region: Region) =>
  `A free 3D map of the water, sewer, gas, electric and telecom lines under ${region.name} streets, from city permits and utility records, for site research, dig scoping and due diligence. Research, not a utility locate: call ${region.markout.center} before you dig.`;

export const cityPage = (region: Region, figures: CityFigures | undefined, stylesheet: string) => {
  const facts = CITY_FACTS[region.id];
  const path = cityPath(region);
  const title = cityTitle(region);
  const description = cityDescription(region);
  const asOf = figures?.asOf
    ? `<p class="note">Figures from the records as of ${escapeHtml(figures.asOf)}.</p>`
    : '';
  return page(
    {
      title: `${title} | ${SITE_NAME}`,
      description,
      path,
      stylesheet,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: title,
        description,
        url: `${SITE_URL}${path}`,
        about: { '@type': 'City', name: region.name },
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${SITE_URL}/` },
      },
    },
    `<header class="intro">
        ${region.beta ? '<p class="kicker"><span class="tag">Beta</span></p>' : ''}
        <h1>${escapeHtml(title)}</h1>
        <p class="lede">Research what's under any ${escapeHtml(region.name)} street before you design, bid or dig: water mains, sewers, gas, electric and telecom lines, drawn in 3D from the city's own public records. Free, with no account.</p>
        <a class="cta" href="${mapLink(facts?.mapAddress ?? null)}">Open the ${escapeHtml(region.name)} map</a>
      </header>
      ${region.beta ? `<p class="beta"><strong>Beta.</strong> ${escapeHtml(region.beta)}</p>` : ''}
      ${whereSection(region, figures)}
      ${leadSection(region, figures)}
      <section class="block warn" aria-labelledby="dig-title">
        <h2 id="dig-title">Before you dig, call 811</h2>
        <p>${SITE_NAME} is research, not a utility locate. ${escapeHtml(region.markout.law)} requires a free locate request to <a href="${escapeHtml(region.markout.url)}" rel="noopener">${escapeHtml(region.markout.center)}</a> ${escapeHtml(region.markout.notice)} before digging, so the utilities can mark their lines on the ground.</p>
      </section>
      ${sourcesSection(region)}
      ${asOf}
      <nav class="block" aria-labelledby="cities-title">
        <h2 id="cities-title">Other cities</h2>
        <ul class="city-list">${otherCities(region)}</ul>
        <p>How often each city digs up its streets is on the <a href="/insights">insights page</a>. To ask about an address from Claude or another AI assistant, <a href="/mcp">add Subsola's MCP server</a>.</p>
      </nav>`,
  );
};
