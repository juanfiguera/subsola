import type { RegionId } from '../../src/regions';
import type { SourceKey } from '../../src/sources/catalog';
import type { UtilityKind } from '../../src/utilities';

/**
 * What the records behind an answer cover in each city, for the docs page. Names, publishers and
 * links come from the catalog; which datasets each city uses is the cities' own (see
 * docs/regions/*.md). A city added to REGIONS without an entry here still gets a row with its 811
 * link.
 */

/**
 * The date of the earliest permit in each city's built data: the start of `permits.<city>.range`
 * in insights.json, which the nightly writes from the cells themselves (as of 2026-11-11). It is the
 * earliest across all of a city's permit datasets, both of New York's and San Diego's and LA's
 * active and archived. Catalog names can mislead ("Street Construction Permits (2013 to 2021)"
 * holds rows back to 1990), so the dates come from the data, not the names.
 */
export const PERMITS_SINCE: Partial<Record<RegionId, string>> = {
  nyc: '1990-07-20',
  dc: '2005-10-25',
  sf: '1995-12-05',
  la: '2000-02-18',
  sd: '2003-08-21',
  sea: '1999-01-01',
  // Not yet in insights.json: Denver's real records start in 2020 (docs/regions/den.md),
  // Chicago's public way openings in 1991, and Dallas's right of way permits in November 2021.
  den: '2020-01-01',
  chi: '1991-01-01',
  dal: '2021-11-17',
};

/** "Since 1990", or null for a city with no date on file. */
export const permitsSince = (region: RegionId): string | null => {
  const date = PERMITS_SINCE[region];
  return date ? `Since ${date.slice(0, 4)}` : null;
};

export interface MappedPipes {
  source: SourceKey;
  /** A word or two for the coverage matrix: "Sewer", "Water (16 in+)". */
  label: string;
  /** Which APWA color its dot takes; recycled water is purple, not water blue. */
  utility: UtilityKind | 'recycled';
}

export interface CityCoverage {
  permits: SourceKey[];
  /** Pipe and cable layers the owner publishes with positions. */
  pipes: MappedPipes[];
  /** The lead service line inventory, or why there's none by lot. */
  serviceLines: SourceKey | { none: string };
}

export const COVERAGE: Partial<Record<RegionId, CityCoverage>> = {
  nyc: {
    permits: ['permitsCurrent', 'permitsHistoric'],
    pipes: [],
    serviceLines: 'serviceLines',
  },
  dc: {
    permits: ['dcPermits'],
    pipes: [{ source: 'dcMains', label: 'Water (16 in+)', utility: 'water' }],
    serviceLines: 'dcServiceLines',
  },
  sf: {
    permits: ['sfPermits'],
    pipes: [
      { source: 'sfSewerMains', label: 'Sewer', utility: 'sewer' },
      { source: 'sfSideSewers', label: 'Side sewers', utility: 'sewer' },
    ],
    serviceLines: { none: 'Not published by lot' },
  },
  la: {
    permits: ['laPermitsActive', 'laPermitsArchived'],
    pipes: [
      { source: 'laSewers', label: 'Sewer', utility: 'sewer' },
      { source: 'laStormDrains', label: 'Storm', utility: 'sewer' },
      { source: 'laSideSewers', label: 'Laterals', utility: 'sewer' },
    ],
    serviceLines: { none: 'Not published' },
  },
  sd: {
    permits: ['sdPermits', 'sdPermitsOld'],
    pipes: [
      { source: 'sdSewers', label: 'Sewer', utility: 'sewer' },
      { source: 'sdWaterMains', label: 'Water', utility: 'water' },
      { source: 'sdStormDrains', label: 'Storm', utility: 'sewer' },
      { source: 'sdRecycledMains', label: 'Recycled water', utility: 'recycled' },
    ],
    serviceLines: 'sdServiceLines',
  },
  sea: {
    permits: ['seaPermits'],
    pipes: [
      { source: 'seaSewers', label: 'Sewer and drainage', utility: 'sewer' },
      { source: 'seaWaterMains', label: 'Water', utility: 'water' },
      { source: 'seaSideSewers', label: 'Side sewers', utility: 'sewer' },
      { source: 'seaElectricLines', label: 'Electric', utility: 'electric' },
    ],
    serviceLines: 'seaServiceLines',
  },
  den: {
    permits: ['denPermits'],
    pipes: [
      { source: 'denSewers', label: 'Sewer', utility: 'sewer' },
      { source: 'denStormDrains', label: 'Storm', utility: 'sewer' },
    ],
    serviceLines: 'denServiceLines',
  },
  chi: {
    permits: ['chiPermits'],
    pipes: [],
    serviceLines: { none: 'Not published' },
  },
  dal: {
    permits: ['dalPermits'],
    pipes: [],
    serviceLines: 'dalServiceLines',
  },
};
