import { cityNames, regionAt, type Region } from '../regions';
import { CITY_CREDITS, linkCredit } from '../attribution';
import { sinceChoices, splitAtYear, type UtilitySummary } from '../brief';
import type { RecordsFreshness } from './freshness';
import type { AssetProperties } from '../sources/assets';
import type { PermitGroupProperties, PermitRecord } from '../sources/permits';
import { permitDateText, permitDay } from '../sources/permitDay';
import { jobNote, permitJobs, type PermitJob } from '../sources/jobs';
import { CONFIDENCE_LABELS, SOURCES, type Confidence, type SourceKey } from '../sources/catalog';
import { depthStandards, describeDepth, formatFeet, type DepthStandard } from '../depth';
import { DIG_TASKS, NEAR_M, type DigAssessment, type DigHit } from '../dig';
import { RECYCLED_WATER, UTILITY_STYLES, inkOn, type UtilityKind } from '../utilities';
import { compassOf, type SewerFlow } from '../scene/slope';
import { escapeHtml, ownerName, prettyAddress, streetName, titleCase } from './dom';
import {
  SERVICE_MATERIAL_LABELS,
  SERVICE_LINE_MEANING,
  SERVICE_SUMMARY,
  denServiceText,
  serviceBasis,
  sidedServiceText,
} from '../serviceText';
import { historyChart, type YearRange } from './history';
import { isRecycled, isStormDrain, type SurveyedMain } from '../sources/mains';
import { houseSewerStatus, type ConnectionPermit } from '../sources/connections';
import type { ServiceLine } from '../scene/services';
import type { DigSpot } from '../scene/digSpots';
import type { AnalyzedArea } from '../areas';
import type { Continuation, Junction } from '../scene/continuations';
import { networkOf } from '../scene/assetStyle';
import { lineCertainty } from '../scene/certainty';
import { sourceLink } from './sourceLink';
import { provenanceBlock, yearSpan } from './provenance';
import { mapCredit, siteLinks } from './siteLinks';

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

const depthHeadline = (standard: DepthStandard | undefined) =>
  standard ? describeDepth(standard) : 'Not a pipe';

export { sourceLink };

const depthBlock = (utility: UtilityKind) => {
  const standard = depthStandards()[utility];
  if (!standard) return '';
  return `
    <div class="depth-block" style="--accent:${UTILITY_STYLES[utility].color}">
      <span class="depth-kicker">${standard.basis === 'unknown' ? 'Depth' : 'Expected depth'}</span>
      <strong class="depth-big">${depthHeadline(standard)}</strong>
      <p>${escapeHtml(standard.summary)}</p>
      ${standard.source ? `<p class="fine">Estimated from ${sourceLink(standard.source.name, standard.source.url)}. Not measured at this location.</p>` : '<p class="fine">No published standard is available to estimate from.</p>'}
    </div>`;
};

/** The quote card: the most specific thing a crew wrote about this spot. */
const quoteCard = (record: PermitRecord) => {
  const quote = record.locationNote ?? record.purpose;
  if (!quote) return '';
  return `
    <figure class="quote-card" style="--accent:${UTILITY_STYLES[record.utility].color}">
      <blockquote>“${escapeHtml(quote)}”</blockquote>
      <figcaption>${escapeHtml(ownerName(record.permittee))}, ${escapeHtml(permitDateText(record, 'undated').replace(/^Starts/, 'starts'))}</figcaption>
    </figure>`;
};

const REPEAT = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 7a5 5 0 0 1 9-3M13 9a5 5 0 0 1-9 3M12 1v3H9M4 15v-3h3"/></svg>`;

/**
 * A permit row, flagged when it's one job permitted again and again (`jobs` from permitJobs). The
 * rows run newest first, so the flag sits on a job's newest listed permit, once.
 */
const recordRow = (jobs: Map<string, PermitJob>) => {
  const flagged = new Set<string>();
  return (record: PermitRecord) => {
    const job = jobs.get(record.permitNumber);
    const id = job && `${job.workOrder}|${job.since}|${job.through}|${job.permits}`;
    const note = id && !flagged.has(id) ? jobNote(job) : null;
    if (id) flagged.add(id);
    return `
  <li class="record">
    <span class="record-date">${escapeHtml(permitDateText(record))}</span>
    <span class="record-what">${escapeHtml(record.purpose ?? titleCase(record.type))}</span>
    <span class="record-who" title="${escapeHtml(record.permittee)}">${escapeHtml(ownerName(record.permittee))}</span>
    ${note ? `<span class="record-job" title="The same holder filed permit after permit for this work as it dragged on.">${REPEAT}${escapeHtml(note)}</span>` : ''}
  </li>`;
  };
};

/** How the position is known, as a label with its explanation on hover. */
export const confidenceTag = (confidence: Confidence) =>
  `<p class="confidence confidence-${confidence}" title="${escapeHtml(CONFIDENCE_LABELS[confidence].detail)}">${CONFIDENCE_LABELS[confidence].label}</p>`;

export const backButton = `<button class="back" data-action="back" aria-label="Back to overview">
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>Back</button>`;

export interface HomeInput {
  title: string;
  neighborhood: string;
  summaries: UtilitySummary[];
  loading: boolean;
  failed: boolean;
  /** Null where the city publishes none (Chicago), so a zero isn't read as an empty street. */
  hydrants: number | null;
  catchBasins: number | null;
  active: LiveWork[];
  /** Set when the street came from the citywide build; null when it loaded live. */
  records: RecordsFreshness | null;
  /** First visit: point to the explainer before anything else. */
  guide: boolean;
  /** Why the city is in beta, when it is (regions.ts). */
  beta?: string | undefined;
  /** Comparing digs from this year on; null shows the whole record. */
  since: number | null;
  currentYear: number;
  /** The city on screen, for the credit its publishers ask for. */
  region: Pick<Region, 'id' | 'photoCredit'>;
}

/** A permit open on the street today, already worded for the card. */
export interface LiveWork {
  ref: string;
  title: string;
  detail: string;
}

const SHOVEL = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 6.5 3 13M8 3.5l4.5 4.5M10.2 1.8l4 4-2.4 2.4-4-4z"/></svg>`;

const digButton = `<button class="dig-cta" data-action="probe">${SHOVEL}<span>Planning to dig? Check a location</span></button>`;

const liveSection = (active: LiveWork[]) =>
  active.length
    ? `<section class="card-section live">
        <h2><span class="live-dot" aria-hidden="true"></span>Active work</h2>
        <ul class="live-list">${active
          .map(
            (work) =>
              `<li><button data-ref="${escapeHtml(work.ref)}"><strong>${escapeHtml(work.title)}</strong><span>${escapeHtml(work.detail)}</span></button></li>`,
          )
          .join('')}</ul>
      </section>`
    : '';

const BADGE: Partial<Record<UtilityKind, string>> = {
  electric: 'E',
  gas: 'G',
  telecom: 'T',
  water: 'W',
  sewer: 'S',
  steam: 'St',
};

const shortDepth = (standard: DepthStandard) =>
  standard.basis === 'unknown' ? 'Not published' : describeDepth(standard).replace(' down', '');

const stat = (label: string, value: string) =>
  `<div class="stat"><dt>${label}</dt><dd>${value}</dd></div>`;

/**
 * First visit: a short note pointing at the explainer (the ? in the top bar), in place of the
 * longer guide that used to sit here. It goes once the explainer is opened or the note waved off.
 */
const guideBlock = () => `
  <section class="guide" aria-labelledby="guide-title">
    <h2 id="guide-title">New here?</h2>
    <p>Colors are utilities, and each line's card says where it comes from.</p>
    <div class="guide-actions">
      <button class="pill pill-ink" data-action="explainer">What you're looking at</button>
      <button class="pill" data-action="guide-done">Got it</button>
    </div>
  </section>`;

/**
 * A city whose records are too thin to stand with the rest (regions.ts) says so beside its name:
 * the reason shows on hover, and a tap opens it under the title for touch screens.
 */
export const betaTag = (reason: string) =>
  `<button class="beta-tag" data-action="beta" aria-expanded="false" aria-controls="beta-reason" title="${escapeHtml(reason)}">Beta</button>`;

export const betaReason = (reason: string) =>
  `<p id="beta-reason" class="beta-reason" hidden>${escapeHtml(reason)}</p>`;

// A speech bubble: the link leads to asking an assistant, so it reads as a chat, not a page.
const CHAT_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2H7l-3 2.5v-2.5h0a1.5 1.5 0 0 1-1.5-1.5Z"/></svg>';

export const homeCard = ({
  title,
  neighborhood,
  summaries,
  loading,
  failed,
  hydrants,
  catchBasins,
  active,
  records,
  guide,
  beta,
  since,
  currentYear,
  region,
}: HomeInput) => {
  const heading = `
    <span class="hood">${escapeHtml(neighborhood)}${beta ? betaTag(beta) : ''}</span>
    <h1 class="card-title">${escapeHtml(title)}</h1>${beta ? betaReason(beta) : ''}${guide ? guideBlock() : ''}`;

  if (failed) {
    return `${heading}
      <div class="depth-block" style="--accent:var(--danger)">
        <strong>Street records could not be loaded</strong>
        <p>NYC Open Data did not respond, so no utilities are shown. This does not mean the street is clear.</p>
      </div>
      <button class="pill retry" data-action="retry">Try again</button>
      <p class="fine"><button class="link" data-action="about">View source status</button></p>`;
  }

  if (loading) {
    return `${heading}
      <p class="hero-line">Loading street records…</p>
      <div class="tiles"><div class="chip-skeleton"></div><div class="chip-skeleton"></div><div class="chip-skeleton"></div><div class="chip-skeleton"></div></div>`;
  }

  const digs = summaries.reduce((sum, s) => sum + s.permitCount, 0);
  const years = summaries.map((s) => s.firstYear).filter((y): y is number => y !== null);
  const pipes = summaries.filter((s) => depthStandards()[s.utility] && s.permitCount);

  const tiles = pipes
    .map((s) => {
      const style = UTILITY_STYLES[s.utility];
      return `
        <li>
          <button class="tile" data-utility="${s.utility}" style="--accent:${style.color};--on-accent:${inkOn(style.color)}">
            <span class="tile-badge" aria-hidden="true">${BADGE[s.utility] ?? ''}</span>
            <span class="tile-label">${style.label}</span>
            <span class="tile-value">${shortDepth(depthStandards()[s.utility]!)}</span>
          </button>
        </li>`;
    })
    .join('');

  const first = years.length ? Math.min(...years) : null;
  const choices = sinceChoices(first, currentYear);
  const split = since !== null ? splitAtYear(allByYear(summaries), since) : null;

  return `${heading}
    ${digButton}
    <button class="pill report-cta" data-action="report">View lot report</button>
    <a class="ai-link" href="/mcp" data-mcp-link="address card">${CHAT_ICON}Ask Claude or ChatGPT about this address</a>
    ${liveSection(active)}
    <section class="card-section">
      <h2>Expected depths</h2>
      ${pipes.length ? `<ul class="tiles">${tiles}</ul>` : '<p class="hero-line">No utility excavation permits on record within 500 ft.</p>'}
    </section>
    <section class="card-section">
      <h2>Within 500 ft</h2>
      ${choices.length ? sincePicker(choices, since) : ''}
      <dl class="stats">
        ${
          split
            ? `${stat(`Since ${since}`, split.after.toLocaleString())}${stat(`Before ${since}`, split.before.toLocaleString())}`
            : `${stat('Permits on record', digs.toLocaleString())}${stat('Since', first !== null ? String(first) : 'n/a')}`
        }
        ${stat('Hydrants', hydrants === null ? 'Not published' : String(hydrants))}
        ${stat('Catch basins', catchBasins === null ? 'Not published' : String(catchBasins))}
      </dl>
      ${since !== null ? compareTable(pipes, since) : ''}
    </section>
    ${recordsNote(records)}
    <p class="fine">${depthStandards().sewer?.basis === 'measured' ? "Sewer depths are from the city's measurements; the rest are estimated from standards." : 'Depths are estimated from city and federal standards, not measured.'} <button class="link" data-action="about">About</button><button class="link fine-link" data-action="feedback">Send feedback</button></p>
    ${cityCredit(region)}
    ${siteLinks('card')}
    ${mapCredit('card')}`;
};

/** The credit this city's publishers ask for, at the foot of its card; all of them at /credits. */
const cityCredit = (region: Pick<Region, 'id' | 'photoCredit'>) =>
  `<p class="fine city-credit">${linkCredit(CITY_CREDITS[region.id], escapeHtml)} Aerial photos: ${escapeHtml(region.photoCredit)}. <a href="/credits#credits-${region.id}">All data credits</a></p>`;

const allByYear = (summaries: UtilitySummary[]) => {
  const total = new Map<number, number>();
  for (const summary of summaries)
    for (const [year, count] of summary.byYear) total.set(year, (total.get(year) ?? 0) + count);
  return total;
};

const sincePicker = (choices: number[], since: number | null) => `
  <label class="since">
    <span>Compare digs since</span>
    <select data-since>
      <option value=""${since === null ? ' selected' : ''}>All years</option>
      ${choices.map((year) => `<option value="${year}"${year === since ? ' selected' : ''}>${year}</option>`).join('')}
    </select>
  </label>`;

/** Each utility's permits from the chosen year on against the ones before. */
const compareTable = (pipes: UtilitySummary[], since: number) => `
  <table class="compare">
    <thead><tr><th>Utility</th><th>Since ${since}</th><th>Before</th></tr></thead>
    <tbody>${pipes
      .map((summary) => {
        const { after, before } = splitAtYear(summary.byYear, since);
        const style = UTILITY_STYLES[summary.utility];
        return `<tr><td><span class="compare-swatch" style="--accent:${style.color}" aria-hidden="true"></span>${style.label}</td><td>${after}</td><td>${before}</td></tr>`;
      })
      .join('')}</tbody>
  </table>
  <p class="fine">Only digs since ${since} are marked on the street.</p>`;

const recordsNote = (records: RecordsFreshness | null) => {
  if (!records) return '';
  if (records.stale)
    return `<p class="fine records-stale">Records last updated ${escapeHtml(records.date)}. Permits issued since then may be missing.</p>`;
  return `<p class="fine">Records updated ${escapeHtml(records.date)}.</p>`;
};

export const utilityCard = (
  summary: UtilitySummary,
  range: YearRange,
  since: number | null = null,
) => {
  const style = UTILITY_STYLES[summary.utility];
  const owner = summary.owners[0] ?? 'Utilities';
  const latest = summary.records.find((r) => r.locationNote || r.purpose);
  return `
    ${backButton}
    <h1 class="card-title" style="color:${style.color}">${style.label}</h1>
    <p class="hero-line">${plural(summary.permitCount, `${style.label.toLowerCase()} excavation permit`)} nearby${summary.firstYear ? ` since ${summary.firstYear}` : ''}, most often issued to ${escapeHtml(owner.replace(/\.$/, ''))}.</p>
    ${depthBlock(summary.utility)}
    ${latest ? quoteCard(latest) : ''}
    ${summary.permitCount ? `<section class="card-section"><h2>Permits per year</h2>${historyChart(summary.byYear, range, style.color, since)}</section>` : ''}
    <section class="card-section"><h2>Most recent</h2><ul class="records">${summary.records
      .slice(0, 6)
      .map(recordRow(permitJobs(summary.records)))
      .join('')}</ul></section>`;
};

/** Which way a sewer main likely drains, stated as an estimate. */
const flowBlock = (flow: SewerFlow | undefined) =>
  flow
    ? `<section class="card-section"><h2>Flow direction</h2><p>Likely ${compassOf(flow.downhill)}, downhill. The street falls from ${Math.round(flow.highFt)} to ${Math.round(flow.lowFt)} ft above sea level along this segment. Most city sewers flow by gravity, so direction is estimated from the city's street spot elevations. Trunk sewers and force mains may not follow the street grade.</p></section>`
    : '';

const runCardBody = (
  props: PermitGroupProperties,
  digSpots: number,
  liveUntil?: string,
  flow?: SewerFlow,
) => {
  const style = UTILITY_STYLES[props.utility];
  const street = props.permits[0]?.street ?? '';
  const latest = props.permits.find((r) => r.locationNote || r.purpose);
  const owner = props.permits[0] ? ownerName(props.permits[0].permittee) : 'Not recorded';
  return `
    ${backButton}
    <span class="hood" style="--hood:${style.color}">${style.label}</span>
    <h1 class="card-title">${escapeHtml(prettyAddress(street.split(' between ')[0] ?? street))}</h1>
    ${confidenceTag('block-level')}
    <p class="hero-line">${escapeHtml(props.count ? `${plural(props.count, 'excavation permit')} on this block` : `No excavation permits on this block, only ${plural(props.permits.length, 'permit')} to open its manholes or use the sidewalk`)}${props.firstYear ? escapeHtml(`, ${props.firstYear === props.lastYear ? props.firstYear : `${props.firstYear} to ${props.lastYear}`}`) : ''}. Most recent permittee: ${escapeHtml(owner.replace(/\.$/, ''))}.</p>
    ${liveUntil ? `<p class="live-banner"><span class="live-dot" aria-hidden="true"></span>Street opening permitted until ${escapeHtml(liveUntil)}</p>` : ''}
    ${depthBlock(props.utility)}
    ${flowBlock(flow)}
    ${latest ? quoteCard(latest) : ''}
    <section class="card-section"><h2>Permits on this block</h2><ul class="records">${props.permits
      .slice(0, 12)
      .map(recordRow(permitJobs(props.permits)))
      .join('')}</ul></section>
    <p class="fine">${
      digSpots
        ? `Positioned from permit location notes: the midpoint of ${plural(digSpots, 'recorded excavation')}, measured from the curbs and offset slightly to avoid overlapping lines. Notes mark a corner of the opening, not the pipe, so the position is approximate and not surveyed. Pipe size is not published.`
        : `Pipe size and position are not published, and no permit on this block records where the ${style.label.toLowerCase()} excavation took place. The line is drawn along the block, offset from other utilities so each remains visible.`
    }</p>`;
};

/** What a mapped main is, in a few words: "Storm drain", "Recycled water main", "Sewer". */
export const mainKind = (main: SurveyedMain) => {
  if (main.use === 'side') return 'House sewer';
  if (main.utility === 'electric') return 'Underground electric line';
  if (isStormDrain(main)) return 'Storm drain';
  if (isRecycled(main)) return 'Recycled water main';
  if (main.utility === 'sewer')
    return main.use ? `${main.use[0]!.toUpperCase()}${main.use.slice(1)} sewer` : 'Sewer';
  return 'Water main';
};

/** The hover callout for a mapped main. */
export const mainCallout = (main: SurveyedMain) => ({
  title: `${mainKind(main)}${main.diameterIn ? `, ${main.diameterIn} in` : ''}`,
  detail: `Mapped route from ${SOURCES[main.source].publisher}. Select for details.`,
});

/** A main on its surveyed route: a city sewer, a house sewer, or a water main (DC's or San Diego's). */
const mainCardBody = (main: SurveyedMain) => {
  const style = isRecycled(main) ? RECYCLED_WATER : UTILITY_STYLES[main.utility];
  const source = SOURCES[main.source];
  const size = main.diameterIn ? `${main.diameterIn} in` : null;
  const year = main.installedYear ? String(main.installedYear) : 'Not recorded';
  if (main.source === 'laSideSewers')
    return `
    ${backButton}
    <span class="hood" style="--hood:${style.color}">House sewer</span>
    <h1 class="card-title">House connection</h1>
    ${confidenceTag('surveyed')}
    <p class="hero-line">A building's own sewer, which LA Sanitation calls a house connection or lateral, from the city sewer in the street to the property line. Drawn on the route the city maps for it.</p>
    ${factList([
      ['Serves', 'Not recorded'],
      ['Size', 'Not recorded'],
      ['Depth', 'At least 4 ft at the property line'],
    ])}
    <p class="fine">The city maps where each connection runs but records no address, size or material for it. City code (LAMC 64.17) puts it at least 4 ft deep at the property line, so it is drawn there. The property owner, not the city, owns and maintains it. Route from ${sourceLink(source.name, source.url)}, ${escapeHtml(source.publisher)}.</p>`;
  if (main.use === 'side')
    return `
    ${backButton}
    <span class="hood" style="--hood:${style.color}">House sewer</span>
    <h1 class="card-title">${escapeHtml(main.address ? streetName(main.address) : 'Side sewer')}</h1>
    ${confidenceTag('surveyed')}
    <p class="hero-line">The building's own sewer, which ${main.source === 'seaSideSewers' ? 'Seattle' : 'San Francisco'} calls a side sewer, from the building to the city sewer in the street. Drawn on the route the city records for it${main.source === 'seaSideSewers' ? '; one side sewer can serve several buildings' : ''}.</p>
    ${factList([
      ['Size', size ?? 'Not recorded'],
      ['Material', main.material ?? 'Not recorded'],
      ...(main.source === 'seaSideSewers' ? [['Installed', year] as [string, string]] : []),
      ['Depth', 'Not recorded'],
    ])}
    <p class="fine">No depth is recorded, so it is drawn at the shallowest depth the city's sewers reach. The property owner, not the city, owns and maintains a side sewer. Route, size and material from ${sourceLink(source.name, source.url)}, ${escapeHtml(source.publisher)}.</p>`;
  if (main.source === 'laStormDrains')
    return `
    ${backButton}
    <span class="hood" style="--hood:${style.color}">Storm drain</span>
    <h1 class="card-title">${escapeHtml([size, main.material?.toLowerCase()].filter(Boolean).join(' ') || 'Storm drain')}</h1>
    ${confidenceTag('surveyed')}
    <p class="hero-line">A storm drain, which carries rain and street runoff to the Los Angeles River, creeks and the ocean without treatment. Los Angeles keeps it apart from the sewers. Drawn on the route the city maps for it.</p>
    ${factList([
      ['Size', size ?? 'Not recorded'],
      ['Material', main.material ?? 'Not recorded'],
      ...(main.owner ? [['Owner', main.owner] as [string, string]] : []),
      [
        'Depth',
        main.depthFt === null
          ? 'Not measured here'
          : `About ${formatFeet(main.depthFt)} to the top of the pipe`,
      ],
    ])}
    <p class="fine">${
      main.depthFt === null
        ? 'No invert is recorded at its ends, or no maintenance hole lid with a recorded height is close by, so it is drawn at the usual depth of the city’s sewers.'
        : 'Depth from the invert recorded at its ends and the nearest maintenance hole lid within 10 m, storm drain or sewer, less the pipe’s own height.'
    } Route, size, material and owner from ${sourceLink(source.name, source.url)}, ${escapeHtml(source.publisher)}.</p>`;
  if (main.utility === 'electric')
    return `
    ${backButton}
    <span class="hood" style="--hood:${style.color}">Underground electric</span>
    <h1 class="card-title">Underground electric line</h1>
    ${confidenceTag('surveyed')}
    <p class="hero-line">${escapeHtml(source.publisher)} cable underground, in conduit or duct bank, on the route it publishes. It generalizes the route for public use and asks that it be used for planning only, so treat the position as approximate.</p>
    ${factList([
      ['Voltage and size', 'Not published'],
      ['Depth', 'Not published'],
    ])}
    <p class="fine">With no depth published, it is drawn just below the pavement, where it could be. Route from ${sourceLink(source.name, source.url)}, ${escapeHtml(source.publisher)}.</p>`;
  if (main.source === 'sdStormDrains')
    return `
    ${backButton}
    <span class="hood" style="--hood:${style.color}">Storm drain</span>
    <h1 class="card-title">${escapeHtml([size, main.material?.toLowerCase()].filter(Boolean).join(' ') || 'Storm drain')}</h1>
    ${confidenceTag('surveyed')}
    <p class="hero-line">A storm drain, which carries rain and street runoff to creeks, bays and the ocean without treatment. San Diego keeps it apart from the sewers. Drawn on the route the city maps for it.</p>
    ${factList([
      ['Size', size ?? 'Not recorded'],
      ['Material', main.material ?? 'Not recorded'],
      ['Installed', year],
      [
        'Depth',
        main.depthFt === null
          ? 'Not measured here'
          : `About ${formatFeet(main.depthFt)} to the top of the pipe`,
      ],
    ])}
    <p class="fine">${
      main.depthFt === null
        ? 'No inlet or cleanout with a recorded rim sits at either end, so it is drawn at the usual depth of the city’s sewers.'
        : 'Depth from the invert recorded at its ends and the rim of the inlet or cleanout there, less the pipe’s own height.'
    } Route, size, material and year from ${sourceLink(source.name, source.url)}, ${escapeHtml(source.publisher)}, as published by SanGIS.</p>`;
  if (main.source === 'denStormDrains')
    return `
    ${backButton}
    <span class="hood" style="--hood:${style.color}">Storm drain</span>
    <h1 class="card-title">${escapeHtml([size, main.material?.toLowerCase()].filter(Boolean).join(' ') || 'Storm drain')}</h1>
    ${confidenceTag('surveyed')}
    <p class="hero-line">A storm drain, which carries rain and snowmelt from the street to the South Platte River and its creeks without treatment. Denver keeps it apart from the sanitary sewers. Drawn on the route the city maps for it.</p>
    ${factList([
      ['Size', size ?? 'Not recorded'],
      ['Material', main.material ?? 'Not recorded'],
      ['Installed', year],
      ...(main.owner ? [['Owner', main.owner] as [string, string]] : []),
      [
        'Depth',
        main.depthFt === null
          ? 'Not measured here'
          : `About ${formatFeet(main.depthFt)} to the top of the pipe`,
      ],
    ])}
    <p class="fine">${
      main.depthFt === null
        ? 'No manhole with a recorded ground elevation sits at either end, so it is drawn at the usual depth of the city’s sewers.'
        : 'Depth from the invert recorded at its ends and the ground at the manhole there, less the pipe’s own height. The city reads most of those grounds from a terrain model, so treat it as within a foot or so.'
    } Route, size, material and year from ${sourceLink(source.name, source.url)}, ${escapeHtml(source.publisher)}.</p>`;
  if (main.utility === 'sewer') {
    const kind = mainKind(main);
    return `
    ${backButton}
    <span class="hood" style="--hood:${style.color}">${escapeHtml(kind)}</span>
    <h1 class="card-title">${escapeHtml([size, main.material?.toLowerCase()].filter(Boolean).join(' ') || kind)}</h1>
    ${confidenceTag('surveyed')}
    <p class="hero-line">${
      main.use === 'combined'
        ? 'Part of the combined sewer, which carries sewage and street runoff together to a treatment plant.'
        : main.use === 'storm'
          ? 'A storm sewer, which carries street runoff, not sewage.'
          : 'A city sewer main.'
    } Drawn on the route the city maps for it.</p>
    ${factList([
      ['Size', size ?? 'Not recorded'],
      ['Material', main.material ?? 'Not recorded'],
      ['Installed', year],
      ...(main.owner ? [['Owner', main.owner] as [string, string]] : []),
      [
        'Depth',
        main.depthFt === null
          ? 'Not measured here'
          : `About ${formatFeet(main.depthFt)} to the top of the pipe`,
      ],
    ])}
    <p class="fine">${
      main.depthFt === null
        ? 'The manholes at its ends have no recorded depth, so it is drawn at the usual depth for the city.'
        : main.source === 'denSewers'
          ? 'Depth from the invert recorded at its ends and the ground at the manholes there, less the pipe’s own height. The city reads most of those grounds from a terrain model, so treat it as within a foot or so.'
          : 'Depth from the rim and invert recorded at the manholes at its ends, less the pipe’s own height.'
    } Route, size, material and year from ${sourceLink(source.name, source.url)}, ${escapeHtml(source.publisher)}.</p>`;
  }
  if (isRecycled(main))
    return `
    ${backButton}
    <span class="hood" style="--hood:${style.color}">Recycled water</span>
    <h1 class="card-title">${escapeHtml([size, main.material?.toLowerCase()].filter(Boolean).join(' ') || 'Recycled water main')}</h1>
    ${confidenceTag('surveyed')}
    <p class="hero-line">A recycled water main, the purple pipe: wastewater treated for irrigation and industry, not for drinking. It is kept apart from the drinking water mains, and no building's water service taps it. Drawn on the route the city maps for it.</p>
    ${factList([
      ['Diameter', size ?? 'Not recorded'],
      ['Material', main.material ?? 'Not recorded'],
      ['Installed', year],
      ...(main.owner ? [['Owner', main.owner] as [string, string]] : []),
    ])}
    ${depthBlock('water')}
    <p class="fine">No depth is recorded, so it is drawn at the city's standard depth for water mains. Route, size, material and year from ${sourceLink(source.name, source.url)}, ${escapeHtml(source.publisher)}, as published by SanGIS.</p>`;
  if (main.source === 'sdWaterMains' || main.source === 'seaWaterMains')
    return `
    ${backButton}
    <span class="hood" style="--hood:${style.color}">Water main</span>
    <h1 class="card-title">${escapeHtml([size, main.material?.toLowerCase()].filter(Boolean).join(' ') || 'Water main')}</h1>
    ${confidenceTag('surveyed')}
    <p class="hero-line">${
      main.use === 'transmission'
        ? 'A transmission main, which carries water across the city to the smaller mains that serve buildings.'
        : 'A distribution main, which the water services of the buildings along it tap.'
    } Drawn on the route the city maps for it.</p>
    ${factList([
      ['Diameter', size ?? 'Not recorded'],
      ['Material', main.material ?? 'Not recorded'],
      ['Installed', year],
    ])}
    ${depthBlock('water')}
    <p class="fine">${
      main.depthFt !== null
        ? `The utility records this main about ${formatFeet(main.depthFt)} down, and it is drawn there.`
        : 'No depth is recorded for this main, so it is drawn at the standard depth for the city.'
    } Route, size, material and year from ${sourceLink(source.name, source.url)}, ${escapeHtml(source.publisher)}.</p>`;
  return `
    ${backButton}
    <span class="hood" style="--hood:${style.color}">Water main</span>
    <h1 class="card-title">${escapeHtml([size, main.material?.toLowerCase()].filter(Boolean).join(' ') || 'Large water main')}</h1>
    ${confidenceTag('utility')}
    <p class="hero-line">One of DC Water's large mains, drawn on the route DC Water maps for it. Mains this size carry water across the city to the smaller mains that serve buildings.</p>
    ${factList([
      ['Diameter', size ?? 'Not recorded'],
      ['Material', main.material ?? 'Not recorded'],
      ['Installed', year],
      ['Route', "DC Water's map"],
    ])}
    ${depthBlock('water')}
    <p class="fine">DC Water maps its mains from as-built drawings and field sketches; it does not publish their depth, so this one is drawn at DC Water's minimum cover. Route, size, material and year from ${sourceLink(source.name, source.url)}, ${escapeHtml(source.publisher)}.</p>`;
};

const SEWER_STANDARDS =
  'https://www.nyc.gov/assets/dep/downloads/pdf/about/water-and-sewer-forms/sewer-design-standards.pdf';
const MS4_MAP = 'https://data.cityofnewyork.us/d/j57c-rqtq';
const WATER_MAIN_DRAWINGS =
  'https://www.nyc.gov/assets/ddc/downloads/publications/infrastructure/WATERMAINSTDDWG-20240919.pdf';

/** How the fixture reaches its main, by DEP's standards, and what of that is drawn. */
const connectionBlock = (props: AssetProperties, linked: boolean, region: Region) => {
  const utility = props.utility ? UTILITY_STYLES[props.utility].label.toLowerCase() : null;
  const missing = `No ${utility ?? ''} main is on record close enough to draw the connection.`;
  // The sizes and rules below are DEP's; other cities' utilities publish no equivalent drawings.
  if (region.id !== 'nyc' && props.kind === 'catch-basin')
    return `<section class="card-section"><h2>How it connects</h2><p>A pipe connects the inlet to the storm or combined sewer. ${linked ? 'It is drawn straight to the nearest sewer. Its size and actual route are not published.' : missing}</p></section>`;
  if (region.id !== 'nyc' && props.kind === 'hydrant')
    return `<section class="card-section"><h2>How it connects</h2><p>A branch line connects the hydrant to the water main, with a gate valve near the main. ${linked ? "It is drawn straight to the nearest main. The published data does not give the branch's size or route." : missing}</p></section>`;
  if (props.kind === 'catch-basin' && props.drainage?.storm)
    return `<section class="card-section"><h2>Drainage</h2><p>To a separate storm sewer, not the sanitary sewer. DEP's ${sourceLink('storm sewer (MS4) map', MS4_MAP)} places this basin in the area draining to outfall ${escapeHtml(props.drainage.outfall)}${props.drainage.water ? `, which discharges into the ${escapeHtml(titleCase(props.drainage.water))}` : ''}. Runoff from here reaches the water untreated. The storm sewer route is not published, so no connection is drawn.</p><p class="fine">The map is current as of August 2020 and does not include storm sewers built since.</p></section>`;
  if (props.kind === 'catch-basin')
    return `<section class="card-section"><h2>How it connects</h2><p>A 12-inch pipe connects the basin to a sewer manhole. DEP does not allow basins to connect directly to sewers smaller than 60 inches (${sourceLink('Sewer Design Standards', SEWER_STANDARDS)}, drawing SE1). ${linked ? 'It is drawn straight to the nearest sewer. The actual route and manhole are not published.' : missing}${props.drainage ? ` It lies outside DEP's mapped storm sewer areas (2020), so it most likely drains to a combined sewer, which carries runoff and sewage to a treatment plant and overflows into the nearest waterway during heavy rain.` : ''}</p></section>`;
  if (props.kind === 'hydrant')
    return `<section class="card-section"><h2>How it connects</h2><p>A 6-inch branch connects to the water main, with a gate valve 1 ft from the main (${sourceLink('DEP hydrant setting standard', WATER_MAIN_DRAWINGS)}, drawing WM0020). ${linked ? 'It is drawn straight to the nearest main.' : missing}</p></section>`;
  if (props.kind === 'manhole')
    return `<section class="card-section"><h2>How it connects</h2><p>${
      utility
        ? `Tagged as ${utility}. A manhole sits over its line, so the ${utility} line likely runs beneath this cover. ${linked ? 'The thin line below ground shows the offset to the drawn line, which is positioned from permit records, not surveyed.' : missing}`
        : 'The utility this manhole serves is not recorded, so it is not connected to a line here. The lettering on the cover identifies the owner.'
    }</p></section>`;
  return '';
};

export const assetCard = (
  props: AssetProperties,
  distanceFeet: number,
  linked: boolean,
  region: Region,
) => {
  const ring = networkOf(props.kind, props.utility);
  const color = ring ? UTILITY_STYLES[ring].color : 'var(--feature)';
  const source = SOURCES[props.sourceKey];
  return `
    ${backButton}
    <span class="hood" style="--hood:${color}">${Math.round(distanceFeet)} ft from the address</span>
    <h1 class="card-title">${escapeHtml(props.title)}</h1>
    ${confidenceTag(source.confidence)}
    <dl class="facts">${props.facts.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>
    ${connectionBlock(props, linked, region)}
    ${(props.kind === 'hydrant' || props.kind === 'catch-basin') && props.utility ? depthBlock(props.utility) : ''}
    <p class="fine">Location from ${sourceLink(source.name, source.url)}, ${escapeHtml(source.publisher)}.</p>`;
};

export const CURB_VALVE_FAQ =
  'https://www.nyc.gov/assets/dep/downloads/pdf/about/water-and-sewer-forms/curb-valve-faq.pdf';

const connectionRows = (permits: ConnectionPermit[]) =>
  permits.length
    ? `<section class="card-section"><h2>Connection permits on this lot</h2><ul class="records">${permits
        .slice(0, 12)
        .map(
          (permit) => `
      <li class="record">
        <span class="record-date">${escapeHtml(permit.date)}</span>
        <span class="record-what">${escapeHtml(`${UTILITY_STYLES[permit.utility].label} ${permit.action.toLowerCase()}`)}</span>
        <span class="record-who">${escapeHtml(permit.permitNumber)}</span>
      </li>`,
        )
        .join('')}</ul></section>`
    : '';

const factList = (facts: [string, string][]) =>
  `<dl class="facts">${facts.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>`;

export const permitSources = () =>
  [SOURCES.connectionPermits, SOURCES.connectionPermitsHistoric]
    .map((s) => sourceLink(s.name, s.url))
    .join(' and ');

const yearOf = (permit: ConnectionPermit) => permit.date.slice(0, 4);

/** One line on what the permits say about a house sewer, for the card and the hover callout. */
export const houseSewerSummary = (permits: ConnectionPermit[]) => {
  const status = houseSewerStatus(permits);
  if (status.kind === 'plugged')
    return {
      short: `plugged ${escapeHtml(yearOf(status.permit))}`,
      long: `DEP's most recent sewer permit for this lot is a plug from ${escapeHtml(yearOf(status.permit))}. The connection was capped, typically ahead of demolition or a replacement connection.`,
    };
  if (status.kind === 'on-record')
    return {
      short: `on record ${escapeHtml(yearOf(status.permit))}`,
      long: `DEP issued a sewer ${escapeHtml(status.permit.action.toLowerCase())} permit for this lot in ${escapeHtml(yearOf(status.permit))}.`,
    };
  return {
    short: 'inferred',
    long: "DEP's published sewer permits begin in 2018, and none is on record for this lot. Nearly every NYC building drains to the city sewer, so a connection is drawn, but it is inferred.",
  };
};

const serviceCardBody = (line: ServiceLine, permits: ConnectionPermit[]) => {
  const { lot } = line;
  const title = `<h1 class="card-title">${escapeHtml(prettyAddress(lot.address))}</h1>`;
  if (line.utility === 'sewer') {
    const status = houseSewerStatus(permits);
    return `
    ${backButton}
    <span class="hood" style="--hood:${UTILITY_STYLES.sewer.color}">House sewer</span>
    ${title}
    ${confidenceTag(status.kind === 'assumed' ? 'inferred' : 'lot-level')}
    <p class="hero-line">${houseSewerSummary(permits).long}</p>
    ${factList([
      [
        'Status',
        status.kind === 'assumed'
          ? 'Inferred'
          : status.kind === 'plugged'
            ? 'Plugged'
            : 'On record',
      ],
      ['Size', "6 or 8 in under DEP's standard; this lot's is not published"],
      ['Route', 'Not published'],
    ])}
    ${connectionRows(permits)}
    <p class="fine">Drawn straight from the nearest sewer main to the lot line, at the main's depth. An actual house sewer slopes down toward the main. Size from the house connection detail (drawing SE-62) in the ${sourceLink('DEP Sewer Design Standards', 'https://www.nyc.gov/assets/dep/downloads/pdf/about/water-and-sewer-forms/sewer-design-standards.pdf')}. Permits from ${permitSources()}, NYC DEP.</p>`;
  }
  const source = SOURCES[lot.source];
  if (lot.sides) {
    const { summary, note, facts } = sidedServiceText({ ...lot, sides: lot.sides });
    const seattle = lot.source === 'seaServiceLines';
    const drawn = seattle
      ? "Drawn straight from where SPU maps its tap on the main to the meter, at the main's depth. The actual line may bend and typically rises toward the meter."
      : lot.source === 'sdServiceLines'
        ? "Drawn straight from the nearest water main to where the inventory places this address, at the main's depth. The actual line may bend and typically rises toward the building; the meter, where the city's side ends, is not placed."
        : "Drawn straight from the nearest water main to the lot line, at the main's depth. The actual line may bend and typically rises toward the building.";
    return `
    ${backButton}
    <span class="hood" style="--hood:${UTILITY_STYLES.water.color}">Water service</span>
    ${title}
    ${confidenceTag('lot-level')}
    <p class="hero-line">${summary}</p>
    <p class="fine">${SERVICE_LINE_MEANING}</p>
    ${factList([
      ...facts,
      ...(seattle
        ? [['Route', 'Tap and meter mapped by SPU'] as [string, string]]
        : [
            ['Size', 'Not published'] as [string, string],
            ['Route', 'Not published'] as [string, string],
          ]),
    ])}
    <p class="fine">${note} ${drawn} Material from ${sourceLink(source.name, source.url)}, ${escapeHtml(source.publisher)}.</p>`;
  }
  if (lot.source === 'denServiceLines') {
    const { summary, note, facts } = denServiceText(lot);
    return `
    ${backButton}
    <span class="hood" style="--hood:${UTILITY_STYLES.water.color}">Water service</span>
    ${title}
    ${confidenceTag('lot-level')}
    <p class="hero-line">${summary}</p>
    <p class="fine">${SERVICE_LINE_MEANING}</p>
    ${factList([...facts, ['Size', 'Not published'], ['Route', 'Not published']])}
    <p class="fine">${note} Drawn straight from the nearest water main on record to where the inventory places this address, at the main's depth. Denver Water publishes no map of its mains, so that main is placed from excavation permits. Category from ${sourceLink(source.name, source.url)}, ${escapeHtml(source.publisher)}.</p>`;
  }
  return `
    ${backButton}
    <span class="hood" style="--hood:${UTILITY_STYLES.water.color}">Water service</span>
    ${title}
    ${confidenceTag('lot-level')}
    <p class="hero-line">${SERVICE_SUMMARY[lot.material]}</p>
    <p class="fine">${SERVICE_LINE_MEANING}</p>
    ${factList([
      ['Material', SERVICE_MATERIAL_LABELS[lot.material]],
      ['How DEP knows', serviceBasis(lot.basis)],
      ['Size', 'Not published'],
      ['Route', 'Not published'],
      [
        'Curb valve',
        line.curbValve
          ? 'Drawn 18 in behind the curb, where DEP requires it'
          : 'Required 18 in behind the curb; no mapped curb to place it on',
      ],
      ...(lot.cityOwned ? [['Lot owner', 'City of New York'] as [string, string]] : []),
    ])}
    ${connectionRows(permits)}
    <p class="fine">Drawn straight from the nearest water main to the lot line, at the main's depth. The actual line may bend and typically rises toward the building. DEP has required a curb valve in the sidewalk 18 inches from the curb since 2021 (${sourceLink('curb valve rules', CURB_VALVE_FAQ)}), so older lines may not have one. Material from ${sourceLink(source.name, source.url)}, ${escapeHtml(source.publisher)}. Permits from ${permitSources()}.</p>`;
};

export const digSpotCard = (spot: DigSpot) => {
  const style = UTILITY_STYLES[spot.utility];
  const year = spot.issued?.slice(0, 4);
  return `
    ${backButton}
    <span class="hood" style="--hood:${style.color}">Excavation location</span>
    <h1 class="card-title">${escapeHtml(`${style.label} excavation${year ? `, ${year}` : ''}`)}</h1>
    ${confidenceTag('block-level')}
    <p class="hero-line">The permit records where the street was opened, measured from two curbs:</p>
    <figure class="quote-card" style="--accent:${style.color}"><blockquote>${escapeHtml(spot.note)}</blockquote></figure>
    ${factList([
      ['Permit', spot.permitNumber],
      ['Issued', spot.issued ?? 'Undated'],
    ])}
    <button class="pill" data-ref="${escapeHtml(spot.permitRef)}">All ${escapeHtml(style.label.toLowerCase())} permits on this block</button>
    <p class="fine">Positioned from the note using the city's curb lines. It marks where the opening began, usually a corner of the work area, so the line is nearby but not necessarily directly below this point.</p>`;
};

export const probePromptCard = () => `
  ${backButton}
  <h1 class="card-title">Check a location</h1>
  <p class="hero-line">Select the point on the map where you plan to dig to see which utilities may be below and their expected depths.</p>
  <button class="pill" data-action="back">Cancel</button>`;

const NEAR_FT = Math.round(NEAR_M / 0.3048 / 5) * 5;

const listOf = (hits: DigHit[]) => {
  const names = hits.map((hit) => UTILITY_STYLES[hit.utility].label.toLowerCase());
  return names.length > 1
    ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
    : (names[0] ?? '');
};

const verdict = ({ level, hits, depthFt }: DigAssessment) => {
  const reaching = hits.filter((hit) => hit.reach !== 'above');
  if (level === 'call-first')
    return {
      title: 'Call 811 before you dig here',
      text: `An excavation ${formatFeet(depthFt)} deep could reach ${listOf(reaching)} lines.`,
    };
  if (level === 'likely-deeper')
    return {
      title: 'Utilities here are typically deeper',
      text: `Records show ${listOf(hits)} near this location, typically below ${formatFeet(depthFt)}. Older lines may be shallower, so an 811 request is still required.`,
    };
  return {
    title: 'No utility records at this location',
    text: `No street permits within ${NEAR_FT} ft in 30 years of records. Private lines do not appear in permits, so an 811 request is still required.`,
  };
};

const REACH_TEXT: Record<DigHit['reach'], string> = {
  reaches: 'Within your excavation depth',
  above: 'Typically deeper',
  unknown: 'Depth unknown',
};

export const probeCard = (assessment: DigAssessment) => {
  const { title, text } = verdict(assessment);
  const tasks = DIG_TASKS.map(
    (task) =>
      `<button data-dig-depth="${task.depthFt}" aria-pressed="${task.depthFt === assessment.depthFt}">${task.label}<span>${formatFeet(task.depthFt)}</span></button>`,
  ).join('');
  const hits = assessment.hits
    .map((hit) => {
      const style = UTILITY_STYLES[hit.utility];
      const depth =
        hit.reach === 'unknown'
          ? 'Depth not published'
          : `From about ${formatFeet(hit.standard.shallowestFt)} down`;
      return `<li class="dig-hit reach-${hit.reach}" style="--accent:${style.color}">
        <span class="layer-swatch" aria-hidden="true"></span>
        <span><strong>${style.label}</strong><small>${depth}</small></span>
        <em>${REACH_TEXT[hit.reach]}</em>
      </li>`;
    })
    .join('');
  return `
    ${backButton}
    <span class="hood">Location check</span>
    <h1 class="card-title">${title}</h1>
    <div class="verdict verdict-${assessment.level}"><p>${escapeHtml(text)}</p></div>
    <section class="card-section">
      <h2>Excavation depth</h2>
      <div class="dig-tasks">${tasks}</div>
      <label class="dig-custom">Exact depth
        <input id="dig-depth" type="range" min="0.5" max="8" step="0.5" value="${assessment.depthFt}" />
        <output>${formatFeet(assessment.depthFt)}</output>
      </label>
    </section>
    ${hits ? `<section class="card-section"><h2>Utilities that may be present</h2><ul class="dig-hits">${hits}</ul></section>` : ''}
    <a class="call-811 dig-811" href="https://www.newyork-811.com/" target="_blank" rel="noopener">Request a free markout (811)</a>
    <p class="fine">Service lines run from the mains to every building, so sidewalks and front yards may also contain gas, water and sewer lines. This is an estimate from public records, not a utility locate. <button class="link" data-action="probe">Check another location</button></p>`;
};

const longDate = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export const cityCard = (
  areas: AnalyzedArea[],
  current: string | null,
  region: Region,
  others: Region[],
  // Zoomed in just past the city line, where there's no street to open.
  missed = false,
) => {
  const items = areas
    // The index is the area's place in the full list, which is how the button names it.
    .map((area, index) => ({ area, index }))
    .filter(({ area }) => regionAt(area.stops[0]!.lngLat) === region)
    .map(
      ({ area, index }) => `
      <li class="area">
        <strong>${escapeHtml(area.name)}</strong>
        <span class="area-when">Reviewed ${longDate(area.checked)}</span>
        <p>${escapeHtml(area.finding)}</p>
        <button class="pill area-open" data-area="${index}">Open ${escapeHtml(area.name)}</button>
      </li>`,
    )
    .join('');
  return `
    <span class="hood">${escapeHtml(region.name)}${region.beta ? betaTag(region.beta) : ''}</span>
    ${region.beta ? betaReason(region.beta) : ''}
    ${
      missed
        ? `<h1 class="card-title">No streets mapped here</h1>
    <p class="hero-line">Subsola maps ${escapeHtml(cityNames())}. Zoom out and pick a street in one of them.</p>`
        : `<h1 class="card-title">City map</h1>
    <p class="hero-line">Zoom in on any street to view the utilities below it${items ? ', or open an area that has been reviewed against the records' : ''}.</p>`
    }
    ${current ? `<button class="pill report-cta" data-action="street">Back to ${escapeHtml(current)}</button>` : ''}
    ${others.map((other) => `<button class="pill" data-action="other-city" data-region="${other.id}">Go to ${escapeHtml(other.name)}</button>`).join('')}
    ${items ? `<section class="card-section"><h2>Reviewed areas</h2><ul class="area-list">${items}</ul></section>` : ''}
    <p class="fine">Map from ${sourceLink('OpenFreeMap', 'https://openfreemap.org/')}, built on OpenStreetMap.</p>`;
};

const continuationCardBody = (run: Continuation, flow?: SewerFlow) => {
  const style = UTILITY_STYLES[run.utility];
  const name = style.label.toLowerCase();
  return `
    ${backButton}
    <span class="hood" style="--hood:${style.color}">${style.label}</span>
    <h1 class="card-title">${escapeHtml(prettyAddress(run.street))}</h1>
    ${confidenceTag('inferred')}
    <p class="hero-line">No ${name} permit is on record for this block, but other blocks of this street have ${name} permits. Mains typically run the length of a street, so the line is continued through this block and shown lighter because it is inferred rather than recorded.</p>
    ${depthBlock(run.utility)}
    ${flowBlock(flow)}
    <p class="fine">The actual main may be in a different position, change size, or end within this block. It is drawn in the same position as on the nearest block with a permit, following the city's street centerline.</p>`;
};

const junctionCardBody = (run: Junction) => {
  const style = UTILITY_STYLES[run.utility];
  const name = style.label.toLowerCase();
  return `
    ${backButton}
    <span class="hood" style="--hood:${style.color}">${style.label}</span>
    <h1 class="card-title">Intersection connection</h1>
    ${confidenceTag('inferred')}
    <p class="hero-line">${plural(run.meeting, `${name} line end`)} meet at this intersection, so they are drawn as connected. Mains usually connect at intersections, often through a valve, but the connection details are not in public records.</p>
    ${depthBlock(run.utility)}
    <p class="fine">The connection is drawn straight to a point between the line ends. The actual fitting, its valves, and whether the lines connect at all are not published.</p>`;
};

/* Every line's card ends with where the line comes from; see provenance.ts. */

export const runCard = (
  props: PermitGroupProperties,
  digSpots: number,
  liveUntil?: string,
  flow?: SewerFlow,
  recordsAsOf: string | null = null,
) => {
  const latest = props.permits.map(permitDay).filter(Boolean).sort().at(-1);
  const span = yearSpan(props.firstYear, props.lastYear);
  return `${runCardBody(props, digSpots, liveUntil, flow)}${provenanceBlock({
    certainty: 'estimated',
    placed: digSpots
      ? `From where crews noted they dug (${plural(digSpots, 'note')}), measured from the curbs. Excavation permits put it on this block.`
      : 'Excavation permits put it on this block. Its place across the street is a set lane, not a record.',
    sources: props.permits.map((permit) => permit.dataset),
    dates: [
      // One permit's year says nothing its date doesn't.
      ...(span && span !== latest?.slice(0, 4) ? [['Permits', span] as [string, string]] : []),
      ...(latest ? [['Latest permit', latest] as [string, string]] : []),
    ],
    recordsAsOf,
  })}`;
};

export const mainCard = (main: SurveyedMain, recordsAsOf: string | null = null) => {
  const certainty = lineCertainty({ surveyed: main });
  return `${mainCardBody(main)}${provenanceBlock({
    certainty,
    placed:
      certainty === 'measured'
        ? `On the route ${SOURCES[main.source].publisher} maps, at the depth its records give.`
        : `On the route ${SOURCES[main.source].publisher} maps. No depth is recorded, so it sits at the standard depth.`,
    sources: [main.source],
    dates: main.installedYear ? [['Installed', String(main.installedYear)]] : [],
    recordsAsOf,
  })}`;
};

export const serviceCard = (
  line: ServiceLine,
  permits: ConnectionPermit[],
  recordsAsOf: string | null = null,
) => {
  const latest = permits
    .map((permit) => permit.date)
    .sort()
    .at(-1);
  const sewer = line.utility === 'sewer';
  return `${serviceCardBody(line, permits)}${provenanceBlock({
    certainty: 'estimated',
    placed: sewer
      ? 'Drawn straight from the sewer main to the lot line. Its route is not published.'
      : 'Drawn straight from the main to the lot. The record is for the lot; the route is not published.',
    sources: sewer
      ? ['connectionPermits', 'connectionPermitsHistoric']
      : [line.lot.source, ...(permits.length ? (['connectionPermits'] as SourceKey[]) : [])],
    dates: latest ? [['Latest permit', latest]] : [],
    recordsAsOf,
  })}`;
};

export const continuationCard = (
  run: Continuation,
  flow?: SewerFlow,
  recordsAsOf: string | null = null,
  sources: SourceKey[] = [],
) =>
  `${continuationCardBody(run, flow)}${provenanceBlock({
    certainty: 'estimated',
    placed: 'Inferred: carried on from excavation permits on other blocks of this street.',
    sources,
    recordsAsOf,
  })}`;

export const junctionCard = (
  run: Junction,
  recordsAsOf: string | null = null,
  sources: SourceKey[] = [],
) =>
  `${junctionCardBody(run)}${provenanceBlock({
    certainty: 'estimated',
    placed: 'Inferred: joined where the line ends meet at this corner.',
    sources,
    recordsAsOf,
  })}`;
