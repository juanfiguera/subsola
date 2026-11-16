import { ownerName } from './ui/dom';
import type { Feature, Geometry } from 'geojson';
import type { PermitGroupProperties, PermitRecord } from './sources/permits';
import { byPermitDayDesc, permitDay } from './sources/permitDay';
import type { AssetFeature, AssetKind } from './sources/assets';
import { UTILITY_KINDS, type UtilityKind } from './utilities';

export interface UtilitySummary {
  utility: UtilityKind;
  permitCount: number;
  firstYear: number | null;
  lastYear: number | null;
  mainPermits: number;
  owners: string[];
  latest: PermitRecord | undefined;
  surveyedAssets: number;
  /** Permit count per calendar year, for the history charts. */
  byYear: Map<number, number>;
  records: PermitRecord[];
}

const ASSET_UTILITY: Partial<Record<AssetKind, UtilityKind>> = {
  hydrant: 'water',
  'catch-basin': 'sewer',
  linknyc: 'telecom',
  'electric-structure': 'electric',
};

const topOwners = (records: PermitRecord[]) => {
  const counts = new Map<string, number>();
  // Counted by today's company, so KeySpan and Brooklyn Union filings add up as National Grid.
  for (const record of records) {
    const owner = ownerName(record.permittee);
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);
};

export const summarize = (
  permitGroups: Feature<Geometry, PermitGroupProperties>[],
  assets: AssetFeature[],
): UtilitySummary[] =>
  UTILITY_KINDS.map((utility) => {
    const records = permitGroups
      .filter((group) => group.properties.utility === utility)
      .flatMap((group) => group.properties.permits)
      .filter((record) => !record.noOpening)
      .sort(byPermitDayDesc);
    const years = records
      .map((record) => Number(permitDay(record)?.slice(0, 4) ?? NaN))
      .filter(Number.isFinite);
    return {
      utility,
      permitCount: records.length,
      firstYear: years.length ? Math.min(...years) : null,
      lastYear: years.length ? Math.max(...years) : null,
      mainPermits: records.filter((record) => record.mentionsMain).length,
      owners: topOwners(records),
      latest: records[0],
      byYear: years.reduce(
        (counts, year) => counts.set(year, (counts.get(year) ?? 0) + 1),
        new Map<number, number>(),
      ),
      records,
      surveyedAssets: assets.filter((asset) => ASSET_UTILITY[asset.properties.kind] === utility)
        .length,
    };
  }).filter((summary) => summary.permitCount > 0 || summary.surveyedAssets > 0);

/** Permits issued in `since` or later, and before it. */
export const splitAtYear = (byYear: Map<number, number>, since: number) => {
  let after = 0;
  let before = 0;
  for (const [year, count] of byYear) {
    if (year >= since) after += count;
    else before += count;
  }
  return { after, before };
};

/**
 * Years to compare from: every fifth year back to the earliest record. Round years are easy to
 * pick, and a lot owner usually knows roughly when they bought or built.
 */
export const sinceChoices = (firstYear: number | null, currentYear: number): number[] => {
  if (firstYear === null) return [];
  const choices: number[] = [];
  for (let year = Math.floor((currentYear - 1) / 5) * 5; year > firstYear; year -= 5)
    choices.push(year);
  return choices;
};

/** True when a dig dated `issued` (YYYY-MM-DD) counts as since `since`. Undated digs don't. */
export const issuedSince = (issued: string | undefined, since: number | null) =>
  since === null || (issued !== undefined && Number(issued.slice(0, 4)) >= since);
