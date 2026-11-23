import { REGIONS, type Region } from '../regions';
import { CONFIDENCE_LABELS, SOURCES, type Confidence, type SourceKey } from '../sources/catalog';
import { depthStandards } from '../depth';
import { UTILITY_STYLES } from '../utilities';
import { escapeHtml } from './dom';
import { sourceLink } from './sourceLink';
import { backButton, confidenceTag, plural } from './cards';
import { ICONS, type IconName } from './icons';
import type { SourceStatus } from './sources';

/**
 * The About card: what Subsola is and isn't, how the map is built, which sources answered for the
 * address on screen, and where else to go. Built to scan in a 360px card or a phone sheet, in the
 * /mcp page's manner: icon rows with one plain line each, and the detail in disclosures.
 */

const MAKER = {
  name: 'Juan Figuera',
  linkedin: 'https://www.linkedin.com/in/juanfiguera',
  github: 'https://github.com/juanfiguera',
};

const LINKEDIN_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.37 7.9H1.8V22h3.57V7.9ZM3.58 6.03c1.14 0 2.07-.93 2.07-2.07S4.72 1.9 3.58 1.9 1.5 2.82 1.5 3.96s.93 2.07 2.08 2.07ZM22.5 14.27c0-4.27-2.28-6.25-5.32-6.25-2.45 0-3.55 1.35-4.16 2.29h-.05V7.9H9.55V22h3.57v-6.98c0-1.84.35-3.62 2.63-3.62 2.25 0 2.28 2.1 2.28 3.74V22h3.57v-7.73Z"/></svg>';

const GITHUB_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1.5a10.5 10.5 0 0 0-3.32 20.46c.53.1.72-.23.72-.5v-1.85c-2.92.63-3.54-1.24-3.54-1.24-.48-1.21-1.17-1.54-1.17-1.54-.95-.65.07-.64.07-.64 1.06.08 1.61 1.09 1.61 1.09.94 1.6 2.46 1.14 3.06.87.1-.68.37-1.14.66-1.4-2.33-.27-4.78-1.17-4.78-5.18 0-1.15.41-2.08 1.08-2.82-.1-.27-.47-1.33.1-2.78 0 0 .88-.28 2.89 1.08a10 10 0 0 1 5.25 0c2-1.36 2.88-1.08 2.88-1.08.58 1.45.21 2.51.1 2.78.68.74 1.08 1.67 1.08 2.82 0 4.02-2.45 4.9-4.79 5.16.38.33.71.97.71 1.96v2.9c0 .28.19.61.73.5A10.5 10.5 0 0 0 12 1.5Z"/></svg>';

const LABEL_ORDER: Confidence[] = [
  'surveyed',
  'utility',
  'block-level',
  'lot-level',
  'crowdsourced',
  'inferred',
];

/** Where each utility's depth comes from, in the city on screen. */
const depthSources = () =>
  (['gas', 'water', 'sewer'] as const)
    .flatMap((utility) => {
      const source = depthStandards()[utility]?.source;
      return source
        ? [`${UTILITY_STYLES[utility].label}: ${sourceLink(source.name, source.url)}.`]
        : [];
    })
    .join(' ');

const more = (body: string, label = 'More') =>
  `<details class="about-more"><summary>${label}</summary>${body}</details>`;

const row = (icon: IconName, title: string, line: string, detail = '') => `
    <li class="about-row">
      <span class="about-icon">${ICONS[icon]}</span>
      <div>
        <h3>${title}</h3>
        <p>${line}</p>
        ${detail}
      </div>
    </li>`;

const depthRow = (region: Region) => {
  const measured = region.depths.sewer?.basis === 'measured';
  const line = measured
    ? `Sewer depths come from ${escapeHtml(region.name)}'s own records of its manholes. The other lines sit at the minimum cover that federal, state and utility installation standards require.`
    : `No public dataset in ${escapeHtml(region.name)} records the actual depth of a pipe. Lines sit at the minimum cover that federal, city and utility installation standards require.`;
  const sources = depthSources();
  return row(
    'depth',
    measured ? 'Depth: measured sewers, standard cover' : 'Depth from standards',
    `${line} Older lines may be shallower or deeper.`,
    sources ? more(`<p>${sources}</p>`, 'Standards used') : '',
  );
};

/** A short count of how the address's sources did, so the list needn't be read to know. */
export const sourceTally = (statuses: Map<SourceKey, SourceStatus>) => {
  const all = [...statuses.values()];
  const loading = all.filter((status) => status.state === 'loading').length;
  const answered = all.filter((status) => status.state === 'ok').length;
  if (!all.length) return '';
  if (loading) return `${loading} still loading`;
  if (answered === all.length) return all.length === 1 ? 'Answered' : `All ${all.length} answered`;
  return `${answered} of ${all.length} answered`;
};

const sourceRow = (key: SourceKey, status: SourceStatus) => {
  const source = SOURCES[key];
  const [mark, state] =
    status.state === 'ok'
      ? [ICONS.check, plural(status.count, 'record')]
      : status.state === 'error'
        ? [ICONS.alert, 'Did not respond']
        : [ICONS.clock, 'Loading…'];
  return `
      <li class="source-row source-${status.state}">
        <span class="source-mark">${mark}</span>
        <span class="source-name">${sourceLink(source.name, source.url)}<span>${escapeHtml(source.publisher)}</span></span>
        <span class="source-state">${state}</span>
      </li>`;
};

/**
 * Redrawn on its own as each source answers, so open disclosures and the scroll stay put. Sources
 * that failed or are still loading stay in view; the full list, often twenty long, folds away.
 */
export const aboutSources = (statuses: Map<SourceKey, SourceStatus>, open = false) => {
  const tally = sourceTally(statuses);
  const entries = [...statuses.entries()];
  const pending = entries.filter(([, status]) => status.state !== 'ok');
  const list = (rows: typeof entries) =>
    `<ul class="source-rows">${rows.map(([key, status]) => sourceRow(key, status)).join('')}</ul>`;
  return `
  <section class="card-section about-section" id="about-sources" aria-labelledby="about-sources-title">
    <div class="about-section-head">
      <h2 id="about-sources-title">Sources for this address</h2>
      ${tally ? `<span class="about-tally">${tally}</span>` : ''}
    </div>
    ${
      entries.length
        ? `${pending.length ? list(pending) : ''}
    <details class="about-more about-all-sources"${open ? ' open' : ''}><summary>See all ${entries.length} sources and their counts</summary>${list(entries)}</details>`
        : '<p class="about-empty">Search an address to see which records answered for it.</p>'
    }
  </section>`;
};

const linkRow = (icon: IconName, title: string, line: string, attributes: string, tag = 'a') => `
      <li>
        <${tag} class="about-link" ${attributes}>
          <span class="about-icon">${ICONS[icon]}</span>
          <span class="about-link-text"><strong>${title}</strong><span>${line}</span></span>
          <span class="about-link-arrow">${ICONS.arrow}</span>
        </${tag}>
      </li>`;

export const aboutCard = (statuses: Map<SourceKey, SourceStatus>, region: Region) => `
  ${backButton}
  <h1 class="card-title">About Subsola</h1>
  <p class="hero-line">The pipes and cables under the street, mapped from public records. Made for engineers, contractors, utility coordinators and real estate teams who plan work there.</p>
  <ul class="about-chips" aria-label="At a glance">
    <li>${ICONS.pin}${REGIONS.length} cities</li>
    <li>${ICONS.clock}Rebuilt nightly</li>
    <li>${ICONS.key}Free, no account</li>
  </ul>
  <div class="about-warn">
    <span class="about-icon">${ICONS.warn}</span>
    <div>
      <h2>Research, not a utility locate</h2>
      <p>${escapeHtml(region.privateOwners)} do not publish where their mains are, and private lines never appear in permits.</p>
      <p><strong>Before any digging,</strong> ${escapeHtml(region.markout.law)} requires a free request to <a href="${escapeHtml(region.markout.url)}" target="_blank" rel="noopener">${escapeHtml(region.markout.center)}</a> at least ${escapeHtml(region.markout.notice)} ahead.</p>
    </div>
  </div>
  <section class="card-section about-section" aria-labelledby="about-uses-title">
    <h2 id="about-uses-title">What it's for</h2>
    <ul class="about-rows">
      ${row('file', 'Site research', 'Which utilities serve a lot, how deep they likely run and who digs there, before the survey.')}
      ${row('crew', 'Scoping a dig', 'What is likely in the way of a trench and at what depth, to plan the work and the locate request.')}
      ${row('check', 'Due diligence', "A property's water service and house sewer, lead status where the city publishes it, and how often its street gets opened, in a lot report you can print.")}
      ${row('repeat', 'Coordinating street work', 'Who has permits out front today and who keeps coming back, so the same block is not opened twice.')}
    </ul>
  </section>
  <section class="card-section about-section" aria-labelledby="about-how-title">
    <h2 id="about-how-title">How the map is built</h2>
    <p class="about-lede">From excavation permits, city asset inventories and, in New York, OpenStreetMap.</p>
    <ul class="about-rows">
      ${row(
        'permit',
        'A permit puts a utility on a block',
        'A utility appears on a block when the city has issued an excavation permit for it there.',
        more(
          '<p>Permits name the block, not the position in the street, so each utility gets its own lane, spaced so none hides another. Where crews wrote down how far from the curbs they opened the street, those notes set the lane instead.</p>',
        ),
      )}
      ${row(
        'carry',
        'Gaps are filled and labeled',
        'A utility with permits on part of a street is carried through the rest of it and labeled Inferred.',
        more(
          '<p>Mains run the length of a street, but permits only cover the blocks someone dug.</p>',
        ),
      )}
      ${row(
        'house',
        'Services run straight to each lot',
        'Water services and house sewers are drawn straight from the main to each lot, because their routes are not published.',
      )}
      ${depthRow(region)}
      ${row(
        'tag',
        'Every line says how it is known',
        'A label on each line, from published city records down to inferred.',
        more(
          `<ul class="label-list">${LABEL_ORDER.map(
            (confidence) =>
              `<li>${confidenceTag(confidence)}<span>${escapeHtml(CONFIDENCE_LABELS[confidence].detail)}</span></li>`,
          ).join('')}</ul>`,
          'See the labels',
        ),
      )}
    </ul>
  </section>
  ${aboutSources(statuses)}
  <div class="about-feedback">
    <ul class="about-links">
      ${linkRow('pencil', 'Send feedback', 'A wrong line, a missing street or an idea.', 'type="button" data-action="feedback"', 'button')}
    </ul>
  </div>
  <footer class="maker">
    <span>Made by</span>
    <a href="${MAKER.linkedin}" target="_blank" rel="noopener">${LINKEDIN_ICON}${MAKER.name}</a>
    <span aria-hidden="true">·</span>
    <a href="${MAKER.github}" target="_blank" rel="noopener">${GITHUB_ICON}GitHub</a>
  </footer>`;
