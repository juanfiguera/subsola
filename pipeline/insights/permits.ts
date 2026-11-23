import type { Dig } from './cells';
import {
  CITIES,
  dateOf,
  figure,
  median,
  round,
  share,
  tally,
  topEntries,
  type City,
  type Figure,
} from './common';

/**
 * Who digs, when, and how often the same block is opened again. A "dig" is one utility permit on
 * the map. Since one job often takes several permits (renewals, extensions, a permit per phase),
 * the reopening figures first merge a holder's permits for one utility on one block that start
 * within 30 days of each other into one visit.
 */

const VISIT_MERGE_DAYS = 30;
const QUICK_RETURN_DAYS = 90;

// NYC lists the raw permittee, which can be a person (a plumber or a homeowner). Only names that
// read as a company or agency are shown; the rest are counted under one label.
const COMPANY =
  /\b(INC|CORP|CORPORATION|CO|COMPANY|LLC|L\.?L\.?C|LTD|LP|EDISON|GRID|KEYSPAN|VERIZON|SPECTRUM|CHARTER|ALTICE|CABLEVISION|LIGHTOWER|ZAYO|CROWN CASTLE|EMPIRE CITY SUBWAY|DEPARTMENT|DEPT|AUTHORITY|DEP|DDC|NYC|CITY|SERVICES?|CONSTRUCTION|CONTRACTING|CONTRACTORS?|ENTERPRISES|INDUSTRIES|GROUP|ASSOCIATES|PLUMBING|SEWER|UTILITIES|UTILITY|ELECTRIC|GAS|TECHNOLOGIES|COMMUNICATIONS|NETWORKS?|ENERGY|TRANSIT|MTA|TELEPORT|FIBER|PSEG|NATIONAL)\b/;
export const NAME_HIDDEN = 'Holder not shown (may be a person)';
export const holderLabel = (city: City, holder: string) =>
  city !== 'nyc' || COMPANY.test(holder.toUpperCase()) ? holder : NAME_HIDDEN;

const yearOf = (day: number) => new Date(day * 86_400_000).getUTCFullYear();
const monthOf = (day: number) => new Date(day * 86_400_000).getUTCMonth();

const SOURCE_DATASETS: Record<City, string[]> = {
  nyc: ['permitsCurrent', 'permitsHistoric'],
  dc: ['dcPermits'],
  sf: ['sfPermits'],
  la: ['laPermitsActive', 'laPermitsArchived'],
  sd: ['sdPermits', 'sdPermitsOld'],
  sea: ['seaPermits'],
  den: ['denPermits'],
  chi: ['chiPermits'],
  dal: ['dalPermits'],
  sj: ['sjPermits', 'sjPermitPoints', 'sjPermitParcels'],
};

const BUILT = 'utility permits as the nightly build classified and placed them (data/cells)';

interface Visit {
  start: number;
  utility: string;
  holder: string;
}

const visitsOf = (digs: Dig[]): Visit[] => {
  const byJob = new Map<string, Dig[]>();
  for (const dig of digs) {
    if (dig.start === null) continue;
    const job = `${dig.holder}|${dig.utility}`;
    const list = byJob.get(job);
    if (list) list.push(dig);
    else byJob.set(job, [dig]);
  }
  const visits: Visit[] = [];
  for (const list of byJob.values()) {
    list.sort((a, b) => a.start! - b.start!);
    let last = -Infinity;
    for (const dig of list) {
      if (dig.start! - last > VISIT_MERGE_DAYS)
        visits.push({ start: dig.start!, utility: dig.utility, holder: dig.holder });
      last = dig.start!;
    }
  }
  return visits.sort((a, b) => a.start - b.start);
};

export interface CityPermits {
  permits: Figure<number>;
  streetOpenings: Figure<number>;
  range: [string, string];
  /** Years with at least a tenth of the busiest year's permits, i.e. the years the data covers. */
  coveredYears: number[];
  byYear: Figure<Record<number, Record<string, number>>>;
  byMonth: Figure<Record<string, number>>;
  byUtility: Figure<Record<string, number>>;
  topHolders: Figure<{ holder: string; permits: number; share: number | null }[]>;
  blockShare: Figure<number | null>;
  reopening: ReturnType<typeof reopening>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const reopening = (
  city: City,
  digs: Dig[],
  blockNames: Map<string, string>,
  [first, last]: [number, number],
) => {
  const byBlock = new Map<string, Dig[]>();
  for (const dig of digs) {
    if (!dig.block || !dig.opening) continue;
    const list = byBlock.get(dig.block);
    if (list) list.push(dig);
    else byBlock.set(dig.block, [dig]);
  }
  const gaps: number[] = [];
  const visitCounts: { block: string; visits: number; utilities: Set<string> }[] = [];
  const buckets = { one: 0, twoToFour: 0, fiveToNine: 0, tenPlus: 0 };
  let withinYear = 0;
  let yearEligible = 0;
  let withinThree = 0;
  let threeEligible = 0;
  let quickOther = 0;
  let quickEligible = 0;
  let totalVisits = 0;
  for (const [block, list] of byBlock) {
    const visits = visitsOf(list);
    if (!visits.length) continue;
    totalVisits += visits.length;
    visitCounts.push({
      block,
      visits: visits.length,
      utilities: new Set(visits.map((v) => v.utility)),
    });
    const n = visits.length;
    if (n === 1) buckets.one += 1;
    else if (n < 5) buckets.twoToFour += 1;
    else if (n < 10) buckets.fiveToNine += 1;
    else buckets.tenPlus += 1;
    for (const [i, visit] of visits.entries()) {
      const next = visits[i + 1];
      if (next) gaps.push(next.start - visit.start);
      if (visit.start <= last - 365) {
        yearEligible += 1;
        if (next && next.start - visit.start <= 365) withinYear += 1;
      }
      if (visit.start <= last - 1095) {
        threeEligible += 1;
        if (next && next.start - visit.start <= 1095) withinThree += 1;
      }
      if (visit.start >= first + QUICK_RETURN_DAYS) {
        quickEligible += 1;
        for (let j = i - 1; j >= 0; j--) {
          const prior = visits[j]!;
          const gap = visit.start - prior.start;
          if (gap > QUICK_RETURN_DAYS) break;
          if (gap >= 1 && prior.utility !== visit.utility && prior.holder !== visit.holder) {
            quickOther += 1;
            break;
          }
        }
      }
    }
  }
  const source = {
    datasets: SOURCE_DATASETS[city],
    filter: `${BUILT}, street openings on a matched block only (NYC manhole embargo, storage, steam stack and pay phone permits left out); one holder's permits for one utility on a block starting within ${VISIT_MERGE_DAYS} days of each other count as one visit`,
  };
  const range: [string, string] = [dateOf(first), dateOf(last)];
  const nameOf = (block: string) =>
    city === 'nyc'
      ? (() => {
          const [borough, street, from, to] = block.split('|');
          return `${street} between ${from} and ${to}, ${borough}`;
        })()
      : (blockNames.get(block) ?? null);
  return {
    blocks: figure(visitCounts.length, source, { range }),
    visits: figure(totalVisits, source, { range }),
    blocksByVisits: figure(buckets, source, { range }),
    medianDaysBetweenVisits: figure(median(gaps), source, { range }),
    reopenedWithinOneYearPct: figure(share(withinYear, yearEligible), source, {
      range,
      note: 'Share of visits followed by another visit on the same block within 365 days; visits in the last year of data are left out.',
    }),
    reopenedWithinThreeYearsPct: figure(share(withinThree, threeEligible), source, {
      range,
      note: 'As above, within 1,095 days; visits in the last three years of data are left out.',
    }),
    otherUtilityWithin90DaysPct: figure(share(quickOther, quickEligible), source, {
      range,
      note: 'Share of visits that came 1 to 90 days after a visit by a different holder for a different utility on the same block.',
    }),
    mostVisited: figure(
      visitCounts
        .sort((a, b) => b.visits - a.visits)
        .slice(0, 10)
        .map(({ block, visits, utilities }) => ({
          block: nameOf(block),
          visits,
          utilities: [...utilities].sort(),
        })),
      source,
      { range },
    ),
  };
};

export const permitInsights = (
  digs: Dig[],
  blockNames: Map<string, string>,
): Partial<Record<City, CityPermits>> => {
  const result: Partial<Record<City, CityPermits>> = {};
  for (const city of CITIES) {
    const own = digs.filter((dig) => dig.city === city);
    // A city with no permits tonight (its download failed, or a build of other cities alone) has
    // no figures rather than a range from nothing; the page leaves out what isn't there.
    if (!own.length) {
      console.warn(`${city}: no permits in the cells, left out of the permit figures`);
      continue;
    }
    const today = Math.floor(Date.now() / 86_400_000);
    // Folded rather than spread: NYC has millions of permits, past the argument limit.
    let first = Infinity;
    let last = -Infinity;
    for (const dig of own) {
      const day = dig.issued ?? dig.start;
      // Planned work can start next year; the data runs up to today.
      if (day === null || day > today) continue;
      first = Math.min(first, day);
      last = Math.max(last, day);
    }
    const range: [string, string] = [dateOf(first), dateOf(last)];
    const source = { datasets: SOURCE_DATASETS[city], filter: BUILT };

    const byYear: Record<number, Record<string, number>> = {};
    const yearTotals = new Map<number, number>();
    const byMonth = new Map<number, number>();
    const byUtility = new Map<string, number>();
    const holders = new Map<string, number>();
    // The breakdowns count street openings, so NYC's manhole embargo permits don't swamp them.
    const openings = own.filter((dig) => dig.opening);
    const openingSource = {
      ...source,
      filter: `${BUILT}; NYC manhole embargo, storage, steam stack and pay phone permits left out`,
    };
    for (const dig of openings) {
      const day = dig.issued ?? dig.start;
      if (day !== null) {
        const year = yearOf(day);
        const row = (byYear[year] ??= {});
        row[dig.utility] = (row[dig.utility] ?? 0) + 1;
        tally(yearTotals, year);
      }
      if (dig.start !== null) tally(byMonth, monthOf(dig.start));
      tally(byUtility, dig.utility);
      tally(holders, holderLabel(city, dig.holder));
    }
    const busiest = Math.max(...yearTotals.values());
    const coveredYears = [...yearTotals.entries()]
      .filter(([, count]) => count >= busiest / 10)
      .map(([year]) => year)
      .sort((a, b) => a - b);
    const monthTotal = [...byMonth.values()].reduce((a, b) => a + b, 0);

    result[city] = {
      permits: figure(own.length, source, { range }),
      streetOpenings: figure(openings.length, openingSource, { range }),
      range,
      coveredYears,
      byYear: figure(byYear, openingSource, {
        range,
        note: 'By year issued, or work start when no issue date.',
      }),
      byMonth: figure(
        Object.fromEntries(
          MONTHS.map((name, i) => [name, share(byMonth.get(i) ?? 0, monthTotal) ?? 0]),
        ),
        openingSource,
        {
          range,
          note: 'Percent of street openings by month work was allowed to start, all years together.',
        },
      ),
      byUtility: figure(Object.fromEntries(topEntries(byUtility, 20)), openingSource, { range }),
      topHolders: figure(
        topEntries(holders, 12).map(([holder, permits]) => ({
          holder,
          permits,
          share: share(permits, openings.length),
        })),
        openingSource,
        {
          range,
          note:
            city === 'nyc'
              ? 'NYC permittee names as filed; names that do not read as a company or agency are grouped.'
              : 'The utility or company the build identified from the permit holder.',
        },
      ),
      blockShare: figure(share(own.filter((dig) => dig.block).length, own.length), source, {
        range,
        note: 'Percent of permits matched to a whole block rather than a point.',
      }),
      reopening: reopening(city, own, blockNames, [first, last]),
    };
  }
  return result;
};

/** Permits per street mile per year, over the full years every city covers. */
export const permitRates = (
  permits: Partial<Record<City, CityPermits>>,
  streetMiles: Record<City, Figure<number>>,
) => {
  const thisYear = new Date().getUTCFullYear();
  const present = CITIES.filter((city) => permits[city]);
  const shared =
    present
      .map((city) => permits[city]!.coveredYears.filter((year) => year < thisYear))
      .reduce<number[] | null>(
        (common, years) => (common ? common.filter((year) => years.includes(year)) : years),
        null,
      ) ?? [];
  const window: [number, number] | null = shared.length ? [shared[0]!, shared.at(-1)!] : null;
  const rates = Object.fromEntries(
    CITIES.map((city) => {
      const own = permits[city];
      if (!window || !own) return [city, null];
      const byYear = own.byYear.value;
      let count = 0;
      for (let year = window[0]; year <= window[1]; year++)
        count += Object.values(byYear[year] ?? {}).reduce((a, b) => a + b, 0);
      const years = window[1] - window[0] + 1;
      return [
        city,
        {
          permitsPerYear: Math.round(count / years),
          perStreetMilePerYear: round(count / years / streetMiles[city].value, 2),
        },
      ];
    }),
  );
  return figure(
    rates,
    {
      datasets: Object.values(SOURCE_DATASETS).flat(),
      filter: `${BUILT}, street openings only; full calendar years every city's permits cover`,
    },
    {
      range: window ? [`${window[0]}-01-01`, `${window[1]}-12-31`] : undefined,
      note: 'Cities file permits differently (NYC files one per block and phase, Seattle one per block a permit reaches, SD and LA one per job), so these rates compare filing, not digging. Read them as a ranking with a wide margin.',
    },
  );
};
