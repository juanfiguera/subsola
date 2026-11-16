import { materialOf } from '../../src/sources/services';
import { share } from './common';

/**
 * One shape for every city's lead service line count, so the insights page can set them side by
 * side. Each inventory counts something different (tax lots, premises, meters, services), which
 * `unit` names; shares are of every row the inventory holds.
 */
export interface LeadSummary {
  unit: string;
  total: number;
  lead: number;
  leadPct: number | null;
  /** Null where the inventory doesn't list galvanized pipe apart (DC files it under lead). */
  galvanized: number | null;
  galvanizedPct: number | null;
  unknown: number;
  unknownPct: number | null;
}

export interface LeadCounts {
  lead: number;
  galvanized: number | null;
  unknown: number;
}

export const leadSummary = (unit: string, total: number, counts: LeadCounts): LeadSummary => ({
  unit,
  total,
  lead: counts.lead,
  leadPct: share(counts.lead, total),
  galvanized: counts.galvanized,
  galvanizedPct: counts.galvanized === null ? null : share(counts.galvanized, total),
  unknown: counts.unknown,
  unknownPct: share(counts.unknown, total),
});

/** NYC DEP's material labels ("Unknown - Lead Status Unknown"), read the way the map reads them. */
export const nycLeadCounts = (byLabel: Map<string, number>): LeadCounts => {
  const counts: LeadCounts = { lead: 0, galvanized: 0, unknown: 0 };
  for (const [label, count] of byLabel) {
    const material = materialOf(label);
    if (material === 'lead') counts.lead += count;
    else if (material === 'galvanized') counts.galvanized = (counts.galvanized ?? 0) + count;
    else if (material === 'unknown') counts.unknown += count;
  }
  return counts;
};

export const DC_VERIFIED = 'Verified lead on either side';
export const DC_SUSPECTED = 'Suspected lead on either side';
export const DC_NO_INFORMATION = 'No information on a side';

/**
 * DC Water's premises: only verified lead counts as lead, and suspected lead joins the premises
 * with no information as not yet known. DC Water files galvanized pipe under lead.
 */
export const dcLeadCounts = (byLabel: Map<string, number>): LeadCounts => ({
  lead: byLabel.get(DC_VERIFIED) ?? 0,
  galvanized: null,
  unknown: (byLabel.get(DC_SUSPECTED) ?? 0) + (byLabel.get(DC_NO_INFORMATION) ?? 0),
});

/** San Diego and Seattle, already read into the map's own materials. */
export const materialLeadCounts = (byMaterial: Map<string, number>): LeadCounts => ({
  lead: byMaterial.get('lead') ?? 0,
  galvanized: byMaterial.get('galvanized') ?? 0,
  unknown: byMaterial.get('unknown') ?? 0,
});
