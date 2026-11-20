import type { z } from 'zod';
import type { serviceLotRowSchema } from '../../src/sources/services';
import { DATASETS, type DatasetSpec } from '../datasets';
import type { dcServiceSchema } from '../dc/datasets';
import type { sdServiceSchema } from '../sd/datasets';
import { sdServiceLine } from '../sd/services';
import type { seaServiceSchema } from '../sea/datasets';
import { seaServiceLine } from '../sea/services';
import type { denServiceSchema } from '../den/datasets';
import type { dalServiceSchema } from '../dal/datasets';
import { dalServiceLine } from '../dal/services';
import { denLeadCategory } from '../den/services';
import { readRows } from '../raw';
import type { BuiltMain } from './cells';
import {
  DC_NO_INFORMATION,
  DC_SUSPECTED,
  DC_VERIFIED,
  dcLeadCounts,
  leadSummary,
  materialLeadCounts,
  nycLeadCounts,
} from './lead';
import { figure, median, round, share, tally, topEntries, type City } from './common';

/**
 * Age, material, depth and length of the mapped sewers and water mains, weighted by length so a
 * thousand short stubs don't outweigh a long trunk line. Lengths are along the mapped line.
 */

// SF PUC files pipes of unknown age under 1840 (13,540 of them), so that year means "not known".
const PLACEHOLDER_YEARS: Record<string, number> = { sfSewerMains: 1840 };
// LA and SF carry a few hundred survey values in the hundreds or millions of feet. LA's deepest
// real trunk sewers run well under this.
const MAX_DEPTH_FT = 100;

const DEPTH_BANDS: [string, number][] = [
  ['under 5 ft', 5],
  ['5 to 10 ft', 10],
  ['10 to 15 ft', 15],
  ['15 to 20 ft', 20],
  ['20 to 30 ft', 30],
  ['30 ft or more', Infinity],
];

const SOURCE_FILTER: Record<string, string> = {
  dcMains: 'DC Water mains as built (water)',
  sfSewerMains: 'SF PUC sewer mains as built',
  sfSideSewers: 'SF side sewers (house laterals) as built',
  laSewers: 'LA Sanitation sewers in service (status F or T) as built',
  laSideSewers: 'LA Sanitation sewer laterals (house connections) as built',
  laStormDrains:
    'LA storm drains, less open channels, swales, ditches and abandoned pipes; depth from storm structure lids or a sewer lid within 10 m',
  sdSewers:
    'San Diego sewer mains as built; depth is cover to invert less pipe height, from manhole rims',
  sdWaterMains: 'San Diego water mains as built',
  sdStormDrains:
    'San Diego storm drains in service, less surface ditches and channels; depth from inlet and cleanout rims',
  sdRecycledMains: 'San Diego recycled water mains as built',
  seaSewers: 'SPU mainlines without phantom connectors as built; depth from recorded end depths',
  seaWaterMains:
    'SPU distribution mains in service (lifecycle C) as built; SPU does not publish its transmission mains, so none is wider than 10 in',
  seaSideSewers:
    'SPU side sewers carrying sewage, connected, stretches joined into one line per network',
  seaElectricLines:
    'City Light underground lines, generalized for public use; no size, year or depth',
  denSewers:
    'Denver public sanitary sewers in service, less stubouts; depth from manhole ground less invert, less pipe height',
  denStormDrains:
    'Denver public storm pipes and culverts in service; depth from storm manhole ground less invert, less pipe height',
};

/** The value below which `quantile` of the total weight falls. */
const weightedQuantile = (pairs: [number, number][], quantile: number): number | null => {
  if (!pairs.length) return null;
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const target = sorted.reduce((sum, [, weight]) => sum + weight, 0) * quantile;
  let running = 0;
  for (const [value, weight] of sorted) {
    running += weight;
    if (running >= target) return value;
  }
  return sorted.at(-1)![0];
};
const weightedMedian = (pairs: [number, number][]) => weightedQuantile(pairs, 0.5);

export const pipeInsights = (mains: BuiltMain[]) => {
  const bySource = new Map<string, BuiltMain[]>();
  for (const main of mains) {
    const list = bySource.get(main.source);
    if (list) list.push(main);
    else bySource.set(main.source, [main]);
  }
  return Object.fromEntries(
    [...bySource.entries()].map(([sourceName, list]) => {
      const source = { datasets: [sourceName], filter: SOURCE_FILTER[sourceName] ?? sourceName };
      let total = 0;
      let datedMiles = 0;
      let depthMiles = 0;
      const decades = new Map<string, number>();
      const materials = new Map<string, number>();
      const depthBands = new Map<string, number>();
      const years: [number, number][] = [];
      const depths: [number, number][] = [];
      const diameters: number[] = [];
      let oldest: number | null = null;
      let deepest: number | null = null;
      let before1900 = 0;
      let implausibleDepths = 0;
      for (const main of list) {
        const length = main.miles;
        total += length;
        const year =
          main.installedYear === PLACEHOLDER_YEARS[sourceName] ? null : main.installedYear;
        if (year && year >= 1800 && year <= 2026) {
          datedMiles += length;
          years.push([year, length]);
          tally(decades, `${Math.floor(year / 10) * 10}s`, length);
          oldest = oldest === null ? year : Math.min(oldest, year);
          if (year < 1900) before1900 += length;
        }
        tally(materials, main.material?.trim().toUpperCase() || 'NOT RECORDED', length);
        if (main.depthFt !== null && main.depthFt >= MAX_DEPTH_FT) implausibleDepths += 1;
        else if (main.depthFt !== null && main.depthFt > 0) {
          depthMiles += length;
          depths.push([main.depthFt, length]);
          deepest = deepest === null ? main.depthFt : Math.max(deepest, main.depthFt);
          const band = DEPTH_BANDS.find(([, below]) => main.depthFt! < below)![0];
          tally(depthBands, band, length);
        }
        if (main.diameterIn && main.diameterIn > 0) diameters.push(main.diameterIn);
      }
      const asShares = (counts: Map<string, number>, whole: number, limit = 12) =>
        Object.fromEntries(
          topEntries(counts, limit).map(([key, value]) => [key, share(value, whole)]),
        );
      return [
        sourceName,
        {
          city: list[0]!.city as City,
          utility: list[0]!.utility,
          pipes: figure(list.length, source),
          miles: figure(round(total), source),
          datedPct: figure(share(datedMiles, total), source, {
            note: 'Percent of miles with an install year.',
          }),
          medianInstallYear: figure(weightedMedian(years), source, {
            note: 'Half the dated miles are older.',
          }),
          oldestYear: figure(oldest, source, {
            note: 'Earliest install year recorded on a pipe still mapped. A placeholder year can sit here; check it.',
          }),
          milesBefore1900: figure(round(before1900), source),
          milesByDecade: figure(
            Object.fromEntries(
              [...decades.entries()].sort().map(([decade, value]) => [decade, round(value)]),
            ),
            source,
          ),
          materialPctOfMiles: figure(asShares(materials, total), source),
          depthRecordedPct: figure(share(depthMiles, total), source),
          depthPctOfMiles: figure(asShares(depthBands, depthMiles), source, {
            note: 'Of the miles with a depth.',
          }),
          medianDepthFt: figure(weightedMedian(depths), source),
          implausibleDepthsDropped: figure(implausibleDepths, source, {
            note: `Pipes with a recorded depth of ${MAX_DEPTH_FT} ft or more, left out of every depth figure.`,
          }),
          depth99thPercentileFt: figure(round(weightedQuantile(depths, 0.99) ?? NaN), source, {
            note: 'One mile in a hundred of the measured pipe lies deeper. Safer to quote than the single deepest.',
          }),
          deepestFt: figure(deepest === null ? null : round(deepest), source, {
            note: 'Single deepest recorded pipe; one bad survey value can set this, so check it before quoting.',
          }),
          medianDiameterIn: figure(median(diameters), source),
          largestDiameterIn: figure(
            diameters.length ? diameters.reduce((a, b) => Math.max(a, b)) : null,
            source,
          ),
        },
      ];
    }),
  );
};

const specOf = (name: string): DatasetSpec => {
  const spec = DATASETS.find((candidate) => candidate.name === name);
  if (!spec) throw new Error(`No dataset spec for ${name}`);
  return spec;
};

/**
 * Lead service line inventories: NYC by tax lot, DC by premise, San Diego by meter, SPU's map of
 * its services by material, Denver Water by premise and Dallas Water Utilities by service. Counts
 * only, no addresses. Each city's `summary` puts its count in one shape (lead.ts) for the insights
 * page.
 */
export const leadServiceInsights = async () => {
  const nyc = new Map<string, number>();
  const nycHow = new Map<string, number>();
  let nycLots = 0;
  for await (const row of readRows(specOf('serviceLines')) as AsyncIterable<
    z.infer<typeof serviceLotRowSchema>
  >) {
    nycLots += 1;
    tally(nyc, row.material);
    if (row.material === 'Lead') tally(nycHow, row.record_ty ?? 'not stated');
  }
  const dc = new Map<string, number>();
  let dcPremises = 0;
  for await (const row of readRows(specOf('dcServiceLines')) as AsyncIterable<
    z.infer<typeof dcServiceSchema>
  >) {
    dcPremises += 1;
    const sides = [row.Pub_Display_Category ?? '', row.Priv_Display_Category ?? ''];
    const label = sides.some((side) => /verified lead/i.test(side) && !/non/i.test(side))
      ? DC_VERIFIED
      : sides.some((side) => /suspected lead/i.test(side) && !/non/i.test(side))
        ? DC_SUSPECTED
        : sides.some((side) => /no information/i.test(side))
          ? DC_NO_INFORMATION
          : 'Non-lead both sides';
    tally(dc, label);
  }
  const sd = new Map<string, number>();
  let sdMeters = 0;
  for await (const row of readRows(specOf('sdServiceLines')) as AsyncIterable<
    z.infer<typeof sdServiceSchema>
  >) {
    sdMeters += 1;
    tally(sd, sdServiceLine(row).material);
  }
  const sea = new Map<string, number>();
  let seaServices = 0;
  for await (const row of readRows(specOf('seaServiceLines')) as AsyncIterable<
    z.infer<typeof seaServiceSchema>
  >) {
    seaServices += 1;
    tally(sea, seaServiceLine(row.MATERIAL).material);
  }
  // Denver Water serves the suburbs too; its premises filed under a Denver address stand in for
  // the city's.
  const den = new Map<string, number>();
  const denMaterials = new Map<string, number>();
  let denPremises = 0;
  for await (const row of readRows(specOf('denServiceLines')) as AsyncIterable<
    z.infer<typeof denServiceSchema>
  >) {
    if (row.PREM_CITY?.trim().toUpperCase() !== 'DENVER') continue;
    const known = denLeadCategory(row.lsli_final_lead_cat);
    if (!known) continue;
    denPremises += 1;
    tally(den, known.category);
    tally(denMaterials, known.material);
  }
  const dal = new Map<string, number>();
  let dalServices = 0;
  for await (const row of readRows(specOf('dalServiceLines')) as AsyncIterable<
    z.infer<typeof dalServiceSchema>
  >) {
    dalServices += 1;
    tally(dal, dalServiceLine(row).material);
  }
  const shares = (counts: Map<string, number>, whole: number) =>
    Object.fromEntries(
      topEntries(counts, 10).map(([key, value]) => [
        key,
        { count: value, pct: share(value, whole) },
      ]),
    );
  return {
    nyc: {
      lots: figure(nycLots, {
        datasets: ['serviceLines'],
        filter: 'DEP lead service line inventory, one row per tax lot',
      }),
      material: figure(shares(nyc, nycLots), {
        datasets: ['serviceLines'],
        filter: 'material field, every lot',
      }),
      leadKnownBy: figure(shares(nycHow, nyc.get('Lead') ?? 0), {
        datasets: ['serviceLines'],
        filter: "record_ty of lots whose material is 'Lead'",
      }),
      summary: figure(leadSummary('tax lots', nycLots, nycLeadCounts(nyc)), {
        datasets: ['serviceLines'],
        filter:
          "material field, every lot; galvanized is DEP's 'Galvanized Service Line Requiring Replacement', unknown is 'Unknown - Lead Status Unknown'",
      }),
    },
    dc: {
      premises: figure(dcPremises, {
        datasets: ['dcServiceLines'],
        filter: 'DC Water service line inventory, one row per premise',
      }),
      status: figure(shares(dc, dcPremises), {
        datasets: ['dcServiceLines'],
        filter: 'public and private side categories combined, worst side wins',
      }),
      summary: figure(leadSummary('premises', dcPremises, dcLeadCounts(dc)), {
        datasets: ['dcServiceLines'],
        filter:
          'lead is verified lead on either side; suspected lead and no information count as unknown; DC Water files galvanized pipe under lead, so none is listed apart',
      }),
    },
    sd: {
      meters: figure(sdMeters, {
        datasets: ['sdServiceLines'],
        filter: 'City of San Diego service line inventory, one row per meter',
      }),
      material: figure(shares(sd, sdMeters), {
        datasets: ['sdServiceLines'],
        filter:
          "the city's entire service line status, else the worse of the utility and customer sides; galvanized only where the city requires replacement",
      }),
      summary: figure(leadSummary('water meters', sdMeters, materialLeadCounts(sd)), {
        datasets: ['sdServiceLines'],
        filter:
          'as material: lead, galvanized requiring replacement, and unknown, of every meter in the inventory',
      }),
    },
    sea: {
      services: figure(seaServices, {
        datasets: ['seaServiceLines'],
        filter: 'SPU water services in service and active, one row per service',
      }),
      material: figure(shares(sea, seaServices), {
        datasets: ['seaServiceLines'],
        filter:
          "the worse of SPU's main to meter and meter to union pieces; galvanized wherever either is galvanized iron or steel, since SPU publishes no Lead and Copper Rule status",
      }),
      summary: figure(leadSummary('water services', seaServices, materialLeadCounts(sea)), {
        datasets: ['seaServiceLines'],
        filter:
          "as material: SPU's own pieces only, up to the owner's union; no lead classification is published",
      }),
    },
    den: {
      premises: figure(denPremises, {
        datasets: ['denServiceLines'],
        filter: 'Denver Water lead service line inventory, premises with a Denver address',
      }),
      category: figure(shares(den, denPremises), {
        datasets: ['denServiceLines'],
        filter: "Denver Water's own category for the whole line",
      }),
      summary: figure(
        leadSummary('premises', denPremises, {
          ...materialLeadCounts(denMaterials),
          galvanized: null,
        }),
        {
          datasets: ['denServiceLines'],
          filter:
            'lead is confirmed lead, which takes in galvanized pipe downstream of lead; likely and unlikely lead count as unknown',
        },
      ),
    },
    dal: {
      services: figure(dalServices, {
        datasets: ['dalServiceLines'],
        filter: 'Dallas Water Utilities service line inventory, one row per service',
      }),
      material: figure(shares(dal, dalServices), {
        datasets: ['dalServiceLines'],
        filter:
          "DWU's status for the whole line, else the worse of the utility and customer sides; galvanized only where DWU requires replacement",
      }),
      summary: figure(leadSummary('water services', dalServices, materialLeadCounts(dal)), {
        datasets: ['dalServiceLines'],
        filter:
          'as material: lead, galvanized requiring replacement, and unknown, of every service in the inventory',
      }),
    },
  };
};
