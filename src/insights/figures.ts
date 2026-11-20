import {
  formatDate,
  formatInt,
  formatPct,
  mostDugBlocks,
  nycHolders,
  pipeSystems,
  topMaterial,
  yearsCovered,
  leadRows,
  type PipeSystem,
} from './derive';
import type { CityKey, Insights } from './schema';

/**
 * Every number in the page's sentences, by the key insights.html names it with
 * (`<b data-fig="nyc-1yr">`). Worked out here, never typed into the markup, so the words follow
 * the nightly figures. A figure the file can't give reads "n/a" rather than a stale number.
 */

const NA = 'n/a';

const reopening = (insights: Insights, city: CityKey) => {
  const permits = insights.permits[city];
  if (!permits) throw new Error(`No permit figures for ${city}`);
  return permits.reopening;
};

/** A material for the middle of a sentence: "asbestos cement", but "PVC" stays as it is. */
const inSentence = (material: string) =>
  /^[A-Z]{2,}/.test(material) ? material : material.toLowerCase();

const materialFigures = (systems: PipeSystem[], key: string, prefix: string) => {
  const top = topMaterial(systems, key);
  const system = systems.find((candidate) => candidate.key === key);
  return {
    [`${prefix}-top-pct`]: top ? `${Math.round(top.pct)}%` : NA,
    [`${prefix}-top`]: top ? inSentence(top.material) : NA,
    [`${prefix}-year`]: system?.medianInstallYear ? String(system.medianInstallYear) : NA,
  };
};

export const pageFigures = (insights: Insights): Record<string, string> => {
  const days = (city: CityKey) => {
    const value = reopening(insights, city).medianDaysBetweenVisits.value;
    return value === null ? NA : formatInt(value);
  };
  const pct = (value: number | null) => formatPct(value);
  const blocks = mostDugBlocks(insights);
  const topBlock = blocks.find((block) => block.city === 'nyc');
  const holders = nycHolders(insights);
  const holderPct = (name: string) => {
    const holder = holders.find((entry) => entry.holder === name);
    return holder ? formatPct(holder.pct) : NA;
  };
  const systems = pipeSystems(insights);
  const lead = new Map(leadRows(insights).map((row) => [row.city, row.summary]));
  const leadCount = (city: CityKey, field: 'lead' | 'galvanized' | 'total') => {
    const value = lead.get(city)?.[field];
    return value == null ? NA : formatInt(value);
  };
  const [nycFirst, nycLast] = yearsCovered(insights, 'nyc') ?? [NA, NA];

  return {
    'nyc-1yr': pct(reopening(insights, 'nyc').reopenedWithinOneYearPct.value),
    'dc-1yr': pct(reopening(insights, 'dc').reopenedWithinOneYearPct.value),
    'nyc-median-days': days('nyc'),
    'dc-median-days': days('dc'),
    'nyc-other-90': pct(reopening(insights, 'nyc').otherUtilityWithin90DaysPct.value),
    'dc-other-90': pct(reopening(insights, 'dc').otherUtilityWithin90DaysPct.value),
    'nyc-first-year': String(nycFirst),
    'nyc-last-year': String(nycLast),
    'top-block': topBlock?.block ?? NA,
    'top-block-digs': topBlock ? formatInt(topBlock.digs) : NA,
    'top-block-utilities': topBlock ? String(topBlock.utilities) : NA,
    'con-ed-pct': holderPct('Con Edison'),
    'national-grid-pct': holderPct('National Grid'),
    ...materialFigures(systems, 'sdWaterMains', 'sd-water'),
    ...materialFigures(systems, 'laSewers', 'la-sewer'),
    ...materialFigures(systems, 'seaWaterMains', 'sea-water'),
    'nyc-lead-pct': lead.get('nyc') ? formatPct(lead.get('nyc')!.leadPct) : NA,
    'nyc-lead': leadCount('nyc', 'lead'),
    'sd-total': leadCount('sd', 'total'),
    'sd-lead': leadCount('sd', 'lead'),
    'sea-total': leadCount('sea', 'total'),
    'sea-lead': leadCount('sea', 'lead'),
    'den-total': leadCount('den', 'total'),
    'den-lead': leadCount('den', 'lead'),
    ...materialFigures(systems, 'denSewers', 'den-sewer'),
    'dal-total': leadCount('dal', 'total'),
    'dal-lead': leadCount('dal', 'lead'),
    'dal-galvanized': leadCount('dal', 'galvanized'),
    'built-date': formatDate(insights.cellsBuiltAt),
  };
};
