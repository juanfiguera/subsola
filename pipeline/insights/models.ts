import { SOURCES, type SourceKey } from '../../src/sources/catalog';
import type { BuiltMain, Dig } from './cells';
import { CITIES, type City } from './common';

/**
 * Models the collected data could train, with the rows available for each, and the license each
 * city's sources carry (subsola.com/insights credits its sources from these). Counts come from
 * this run; the names, links and license text are the catalog's own.
 */

const PERMIT_SOURCES: Record<City, SourceKey[]> = {
  nyc: ['permitsCurrent', 'permitsHistoric'],
  dc: ['dcPermits'],
  sf: ['sfPermits'],
  la: ['laPermitsActive', 'laPermitsArchived'],
  sd: ['sdPermits', 'sdPermitsOld'],
  sea: ['seaPermits'],
  den: ['denPermits'],
  chi: ['chiPermits'],
  dal: ['dalPermits'],
};

// The lead service line inventories leadServiceInsights counts, so the page can credit them too.
const SERVICE_SOURCES: Partial<Record<City, SourceKey>> = {
  nyc: 'serviceLines',
  dc: 'dcServiceLines',
  sd: 'sdServiceLines',
  sea: 'seaServiceLines',
  den: 'denServiceLines',
  dal: 'dalServiceLines',
};

const PIPE_SOURCES: SourceKey[] = [
  'dcMains',
  'sfSewerMains',
  'laSewers',
  'laStormDrains',
  'sdSewers',
  'sdWaterMains',
  'sdStormDrains',
  'sdRecycledMains',
  'seaSewers',
  'seaWaterMains',
  'denSewers',
  'denStormDrains',
];

// Buildings' own sewers: no depth or year is recorded for any of them.
const isSide = (main: BuiltMain) => main.use === 'side';

export const modelIdeas = (digs: Dig[], mains: BuiltMain[]) => {
  const blockDigs = digs.filter((dig) => dig.block);
  const blocks = new Set(blockDigs.map((dig) => `${dig.city}|${dig.block}`)).size;
  const measured = mains.filter(
    (main) => main.depthFt !== null && main.depthFt > 0 && !isSide(main),
  );
  const undated = mains.filter((main) => !main.installedYear && !isSide(main)).length;
  const dated = mains.filter((main) => main.installedYear && !isSide(main)).length;
  const measuredBy = Object.fromEntries(
    [...new Set(measured.map((main) => main.source))].map((source) => [
      source,
      measured.filter((main) => main.source === source).length,
    ]),
  );
  return {
    ideas: [
      {
        name: 'Next dig on a block',
        task: 'Predict whether a block will be dug in the next 12 months, and by which utility.',
        label:
          'Any utility permit on the block in the following year (from the permit history itself).',
        features:
          'Visits per utility in past years, days since the last visit, number of distinct utilities, season, city; joinable with pipe age and material where the city maps mains.',
        rows: { blocks, permitsOnBlocks: blockDigs.length },
        useful:
          'Coordinating street work: flag blocks about to be opened, before they are repaved.',
        caveat:
          'Permits record permission, not digging; filing habits differ by city, so train and test per city first.',
      },
      {
        name: 'Utility from permit text',
        task: 'Classify a free-text permit into utility and work type for cities without clean codes.',
        label: "The rule classifiers' output (weak labels), ideally spot-checked by hand.",
        features: 'Permit type, holder company, scope or purpose text, street.',
        rows: { permits: digs.length },
        useful: "A model that reads a new city's permit text without new rules.",
        caveat:
          'Labels come from regex rules, so a model learns the rules unless a hand-labeled test set is built. Free text can hold personal data; scrub before training.',
      },
      {
        name: 'Pipe depth estimation',
        task: 'Estimate the depth of a sewer or water main where none is recorded.',
        label: 'Recorded depth on mains that have one.',
        features:
          'Diameter, material, install year, use (sanitary, storm, combined), city; add ground slope from elevations.',
        rows: { measuredPipes: measured.length, bySource: measuredBy },
        useful:
          'Depths for NYC, DC and the undated pipes elsewhere, where the map now falls back to design standards.',
        caveat:
          'Depth is mostly sewers in San Diego, Seattle and LA; water main depth is rarely recorded, and gas, electric and telecom never.',
      },
      {
        name: 'Pipe age and material imputation',
        task: 'Fill in the install year or material of pipes with none recorded.',
        label: 'Install year and material on pipes that have them.',
        features: 'Neighboring pipes, street age (permit history start), diameter, use, city.',
        rows: { dated, undated },
        useful:
          'Age is the main driver of breaks and replacement; most public maps leave it blank.',
        caveat:
          'Missing values are not random (older pipes are more often undated), so validate by district.',
      },
    ],
    licenses: Object.fromEntries(
      CITIES.map((city) => [
        city,
        Object.fromEntries(
          [
            ...PERMIT_SOURCES[city],
            ...PIPE_SOURCES.filter((key) => key.startsWith(city)),
            ...(SERVICE_SOURCES[city] ? [SERVICE_SOURCES[city]] : []),
          ].map((key) => [
            key,
            {
              name: SOURCES[key].name,
              publisher: SOURCES[key].publisher,
              license: SOURCES[key].license,
              url: SOURCES[key].url,
            },
          ]),
        ),
      ]),
    ),
  };
};
