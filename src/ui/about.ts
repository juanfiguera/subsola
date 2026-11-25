import type { Region } from '../regions';
import { SOURCES, type SourceKey } from '../sources/catalog';
import { escapeHtml } from './dom';
import { sourceLink } from './sourceLink';
import { backButton, plural } from './cards';
import { ICONS, type IconName } from './icons';
import type { SourceStatus } from './sources';

/**
 * The map's sources card: which records answered for the address on screen, and that city's 811
 * notice, the part of "about" that belongs to one address. Everything else about Subsola is on
 * its own page, /about (src/pages/about.ts), which this card links to.
 */

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
  <h1 class="card-title">Sources</h1>
  <p class="hero-line">The public records behind the street on screen, and whether each one answered.</p>
  <div class="about-warn">
    <span class="about-icon">${ICONS.warn}</span>
    <div>
      <h2>Research, not a utility locate</h2>
      <p>${escapeHtml(region.privateOwners)} do not publish where their mains are, and private lines never appear in permits.</p>
      <p><strong>Before any digging,</strong> ${escapeHtml(region.markout.law)} requires a free request to <a href="${escapeHtml(region.markout.url)}" target="_blank" rel="noopener">${escapeHtml(region.markout.center)}</a> at least ${escapeHtml(region.markout.notice)} ahead.</p>
    </div>
  </div>
  ${aboutSources(statuses)}
  <div class="about-feedback">
    <ul class="about-links">
      ${linkRow('file', 'About Subsola', 'What it is, how the map is built and where the data comes from.', 'href="/about"')}
      ${linkRow('pencil', 'Send feedback', 'A wrong line, a missing street or an idea.', 'type="button" data-action="feedback"', 'button')}
    </ul>
  </div>`;
