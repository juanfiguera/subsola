import { barChart, h, stackBar, type Series } from './charts';
import {
  BLOCK_CITIES,
  CITY_LABELS,
  NOT_RECORDED,
  OTHER_MATERIALS,
  formatInt,
  formatPct,
  formatShare,
  leadRows,
  mostDugBlocks,
  nycHolders,
  pipeSystems,
  reopeningRows,
  sourceCredits,
  yearsCovered,
  type PipeSystem,
} from './derive';
import { pageFigures } from './figures';
import { insightsSchema, type Insights } from './schema';
import { mountThemeToggle } from '../ui/themeToggle';
import { fillIcons, watchSections } from './sectionNav';
import { startAnalytics } from '../analytics';
import './insights.css';

/**
 * subsola.com/insights: the figures the nightly build publishes next to the map's cells
 * (insights.json, written by `pnpm insights`), read at load and drawn here. Nothing on the page is
 * a number typed by hand.
 */

startAnalytics(import.meta.env.VITE_POSTHOG_KEY as string | undefined, { page: 'insights' });

const DATA_URL = `${((import.meta.env.VITE_CELLS_URL as string | undefined) ?? 'https://data.subsola.com').replace(/\/$/, '')}/insights.json`;

const byId = (id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`insights.html has no #${id}`);
  return node;
};

const fillFigures = (insights: Insights) => {
  const figures = pageFigures(insights);
  for (const node of Array.from(document.querySelectorAll<HTMLElement>('[data-fig]'))) {
    const value = figures[node.dataset.fig ?? ''];
    if (value === undefined) throw new Error(`No figure named ${node.dataset.fig}`);
    node.textContent = value;
  }
};

const ONE_SERIES: Series[] = [{ name: '', tone: 'tone-ink' }];

const drawReopening = (insights: Insights) => {
  const rows = reopeningRows(insights);
  byId('chart-repeat').replaceChildren(
    barChart(
      rows.map((row) => ({
        label: row.label,
        values: [
          { value: row.withinOneYear, text: formatPct(row.withinOneYear) },
          { value: row.withinThreeYears, text: formatPct(row.withinThreeYears) },
        ],
      })),
      [
        { name: 'Within 1 year', tone: 'tone-ink' },
        { name: 'Within 3 years', tone: 'tone-mid' },
      ],
      100,
    ),
  );
  const days = rows.map((row) => row.medianDays ?? 0);
  byId('chart-gap').replaceChildren(
    barChart(
      rows.map((row) => ({
        label: row.label,
        values: [
          {
            value: row.medianDays,
            text: row.medianDays === null ? 'n/a' : `${formatInt(row.medianDays)} days`,
          },
        ],
      })),
      ONE_SERIES,
      Math.max(...days),
      5.5,
    ),
  );
  const quick = rows.map((row) => row.otherUtility90 ?? 0);
  byId('chart-other').replaceChildren(
    barChart(
      rows.map((row) => ({
        label: row.label,
        values: [{ value: row.otherUtility90, text: formatPct(row.otherUtility90) }],
      })),
      ONE_SERIES,
      Math.max(...quick),
    ),
  );
};

const drawMostDug = (insights: Insights) => {
  const blocks = mostDugBlocks(insights);
  const groups = BLOCK_CITIES.map((city) => blocks.filter((block) => block.city === city)).filter(
    (group) => group.length,
  );
  byId('most-dug-list').replaceChildren(
    ...groups.map((group) =>
      h(
        'div',
        { class: 'dug-city' },
        h('h3', {}, group[0]!.label),
        h(
          'ol',
          { class: 'dug' },
          ...group.map((block) =>
            h(
              'li',
              {},
              h('span', { class: 'dug-block' }, block.block),
              h(
                'span',
                { class: 'dug-count' },
                h('strong', {}, formatInt(block.digs)),
                ` digs, ${block.utilities} kinds of utility work`,
              ),
            ),
          ),
        ),
      ),
    ),
  );
};

const drawHolders = (insights: Insights) => {
  const holders = nycHolders(insights);
  byId('chart-holders').replaceChildren(
    barChart(
      holders.map((holder) => ({
        label: holder.holder,
        values: [
          { value: holder.pct, text: `${formatPct(holder.pct)} (${formatInt(holder.permits)})` },
        ],
      })),
      ONE_SERIES,
      Math.max(...holders.map((holder) => holder.pct ?? 0)),
      8.5,
    ),
  );
};

// Muted and told apart by lightness as well as hue; the printed key carries the exact shares. CSS
// variables from insights.css, so each theme gets its own shade of the same twelve.
const MATERIAL_COLORS = Array.from({ length: 12 }, (_, i) => `var(--material-${i + 1})`);
const OTHER_COLOR = 'var(--material-other)';
// Missing records aren't a material, so they get gray, not a hue.
const NOT_RECORDED_COLOR = 'var(--material-unrecorded)';

/** One color per material across every city, so clay is the same color in LA and SF. */
const materialColors = (systems: PipeSystem[]) => {
  const totals = new Map<string, number>();
  for (const system of systems)
    for (const { material, pct } of system.materials)
      if (material !== OTHER_MATERIALS && material !== NOT_RECORDED)
        totals.set(material, (totals.get(material) ?? 0) + pct);
  const colors = new Map(
    [...totals]
      .sort((a, b) => b[1] - a[1])
      .map(([material], index) => [material, MATERIAL_COLORS[index % MATERIAL_COLORS.length]!]),
  );
  colors.set(OTHER_MATERIALS, OTHER_COLOR);
  colors.set(NOT_RECORDED, NOT_RECORDED_COLOR);
  return colors;
};

const drawPipes = (insights: Insights) => {
  const systems = pipeSystems(insights);
  const colors = materialColors(systems);
  byId('pipe-systems').replaceChildren(
    ...systems.map((system) =>
      h(
        'li',
        { class: 'system' },
        h(
          'div',
          { class: 'system-head' },
          h('h3', {}, system.name),
          h(
            'span',
            { class: 'system-meta' },
            `${formatInt(system.miles)} miles${system.medianInstallYear ? `, half laid before ${system.medianInstallYear}` : ''}`,
          ),
        ),
        h('p', { class: 'system-scope' }, system.scope),
        stackBar(
          system.materials.map(({ material, pct }) => ({
            label: material,
            pct,
            color: colors.get(material) ?? OTHER_COLOR,
          })),
        ),
      ),
    ),
  );
};

const drawLead = (insights: Insights) => {
  const rows = leadRows(insights);
  const max = Math.max(
    ...rows.flatMap(({ summary }) => [
      summary.leadPct ?? 0,
      summary.galvanizedPct ?? 0,
      summary.unknownPct ?? 0,
    ]),
  );
  byId('chart-lead').replaceChildren(
    barChart(
      rows.map(({ label, summary }) => ({
        label: `${label}, ${formatInt(summary.total)} ${summary.unit}`,
        values: [
          { value: summary.leadPct, text: formatShare(summary.leadPct, summary.lead) },
          {
            value: summary.galvanizedPct,
            text: formatShare(summary.galvanizedPct, summary.galvanized),
          },
          { value: summary.unknownPct, text: formatShare(summary.unknownPct, summary.unknown) },
        ],
      })),
      [
        { name: 'Lead', tone: 'tone-ink' },
        { name: 'Galvanized, to be replaced', tone: 'tone-mid' },
        { name: 'Not yet known', tone: 'tone-light' },
      ],
      max,
      8.5,
    ),
  );
};

const drawMethods = (insights: Insights) => {
  byId('years-covered').replaceChildren(
    ...(['nyc', 'dc', 'sf', 'sea', 'den', 'chi', 'la', 'sd'] as const).flatMap((city) => {
      const years = yearsCovered(insights, city);
      return years ? [h('li', {}, `${CITY_LABELS[city]}: ${years[0]} to ${years[1]}`)] : [];
    }),
  );
  byId('source-list').replaceChildren(
    ...sourceCredits(insights).map((credit) =>
      h(
        'li',
        {},
        h('strong', {}, credit.label),
        h(
          'ul',
          {},
          ...credit.entries.map((entry) =>
            h(
              'li',
              {},
              entry.url && /^https:\/\//.test(entry.url)
                ? h('a', { href: entry.url, rel: 'noopener', target: '_blank' }, entry.name)
                : entry.name,
              `, ${entry.publisher}. ${entry.license}.`,
            ),
          ),
        ),
      ),
    ),
  );
};

const showError = (error: unknown) => {
  console.error('Insights did not load', error);
  byId('loading').hidden = true;
  byId('figures').hidden = true;
  byId('load-error').hidden = false;
};

const load = async () => {
  byId('load-error').hidden = true;
  byId('loading').hidden = false;
  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${DATA_URL}`);
    const insights = insightsSchema.parse(await res.json());
    fillFigures(insights);
    drawReopening(insights);
    drawMostDug(insights);
    drawHolders(insights);
    drawPipes(insights);
    drawLead(insights);
    drawMethods(insights);
    byId('loading').hidden = true;
    byId('figures').hidden = false;
    for (const node of Array.from(document.querySelectorAll<HTMLElement>('[data-after-load]')))
      node.hidden = false;
    watchSections(byId('section-nav'));
  } catch (error) {
    showError(error);
  }
};

fillIcons(document);
mountThemeToggle(byId('theme-toggle'));
byId('retry').addEventListener('click', () => void load());
void load();
