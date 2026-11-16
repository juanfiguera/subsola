import type { UtilityKind } from '../../src/utilities';
import { energyWork } from '../gasOrElectric';

/**
 * Denver's street occupancy permits name a purpose ("Street Cut - Water", "Fiber Optics",
 * "Utility") and the company that holds them. Most of them close a lane for a crane, a dumpster or
 * a paving job; only the purposes that cut the street for a utility are kept. Where the purpose
 * names the utility it settles it; otherwise the company does. Xcel Energy runs both gas and
 * power in Denver, and its permits rarely say which: its contractors usually tell, and when
 * nothing does it's filed as gas, the more common work, and marked as assumed. See
 * docs/regions/den.md.
 */

export interface DenWork {
  utility: UtilityKind;
  owner: string;
  /** Xcel didn't say gas or electric, so gas was assumed. */
  assumed: boolean;
}

/** Purposes that say which utility the street was cut for. */
const BY_PURPOSE: Record<string, UtilityKind> = {
  'Street Cut - Water': 'water',
  'Fire Hydrant': 'water',
  'Street Cut - Sewer': 'sewer',
  'Sanitary Sewer': 'sewer',
  'Fiber Optics': 'telecom',
  Cable: 'telecom',
};

/**
 * Purposes that cut the street for a utility without saying which, read from the company. "ROW
 * Construction", "Boring" and "Miscellaneous" are kept only for a utility or its known
 * contractors: the city's paving and building contractors file them too.
 */
const BY_COMPANY = new Set([
  'Utility',
  'Street Cut - Utilities',
  'ROW Construction',
  'Boring and/or Wells',
  'Miscellaneous - Multi-Categories',
]);

/** Every purpose either list keeps, for the download's filter. */
export const DEN_DIG_PURPOSES = [...Object.keys(BY_PURPOSE), ...BY_COMPANY];

const DENVER_WATER = /denver water|\bDWB?\b/i;
const XCEL = /\bxcel\b|public service co/i;
// The city's own street, signal and building jobs ("CCD (CPM Trans) & PCL"), not a utility's,
// unless they name one.
const CITY = /^CCD\b/i;
// Denver's own sewer crews (Capital Projects Management, Wastewater) and the regional district.
const DENVER_SEWERS = /\bCPM WW\b|wastewater/i;
const METRO_SEWERS = /metro (wastewater|water recovery)|\bMWRD\b/i;

const UTILITIES: [RegExp, string, UtilityKind][] = [
  [/century ?link|\bqwest\b|\blumen\b|level 3/i, 'Lumen (CenturyLink)', 'telecom'],
  [/comcast/i, 'Comcast', 'telecom'],
  [/\bzayo\b/i, 'Zayo', 'telecom'],
  [/crown castle/i, 'Crown Castle', 'telecom'],
  [/verizon|\bMCI\b/i, 'Verizon', 'telecom'],
  [/\bAT ?& ?T\b/i, 'AT&T', 'telecom'],
  [/t-?mobile/i, 'T-Mobile', 'telecom'],
];

// Contractors that do one utility's work in Denver. Gas and power here are Xcel's alone, so a gas
// contractor's dig is Xcel's gas line whoever's name is on the permit.
const GAS_CONTRACTORS = /\bmears\b|sitewise|\bQ3\b|miller pipeline|\bAMRP\b|\bLDC\b|\bgas\b/i;
// Sturgeon Electric also builds the city's signals, filed under the city's name, which is left
// out before this is asked.
const ELECTRIC_CONTRACTORS =
  /hooper corp|d ?& ?d power|ward electric|par electrical|michels power|sturgeon|outdoor lighting/i;
const TELECOM_CONTRACTORS =
  /telecom|communications|wireless|broadband|fiber|cablecom|\bpauley\b|\bwyco\b|\bADB\b|bluestream|mastec|tilson|wavelink|eastex tower/i;
// Sewer cleaners and drain layers mostly fix a building's own sewer under the street. Plumbers
// lay water services too, so they count only where the purpose says which.
const SEWER_TRADES = /sewer|rooter|\bdrains?\b/i;

const work = (utility: UtilityKind, owner: string, assumed = false): DenWork => ({
  utility,
  owner,
  assumed,
});

/** Whose line a permit for `utility` most likely was, from the company named. */
const ownerFor = (utility: UtilityKind, company: string) => {
  if (utility === 'water' && DENVER_WATER.test(company)) return 'Denver Water';
  // Xcel lays fiber for its own grid too, under "Fiber Optics".
  if (utility !== 'water' && utility !== 'sewer' && XCEL.test(company)) return 'Xcel Energy';
  if (utility === 'sewer' && METRO_SEWERS.test(company)) return 'Metro Water Recovery';
  if (utility === 'sewer' && DENVER_SEWERS.test(company)) return 'Denver Wastewater';
  const named = UTILITIES.find(([pattern, , kind]) => kind === utility && pattern.test(company));
  return named?.[1] ?? 'Other permit holder';
};

/** The utility a permit cut the street for, or null for work that isn't a utility's dig. */
export const classifyDenPermit = (
  purpose: string | null | undefined,
  company: string | null | undefined,
): DenWork | null => {
  const kind = purpose?.trim() ?? '';
  const holder = company?.trim() ?? '';
  const named = BY_PURPOSE[kind];
  if (named) return work(named, ownerFor(named, holder));
  if (!BY_COMPANY.has(kind) || !holder) return null;
  if (DENVER_WATER.test(holder)) return work('water', 'Denver Water');
  if (METRO_SEWERS.test(holder)) return work('sewer', 'Metro Water Recovery');
  if (DENVER_SEWERS.test(holder)) return work('sewer', 'Denver Wastewater');
  if (CITY.test(holder) && !XCEL.test(holder)) return null;
  if (XCEL.test(holder) || GAS_CONTRACTORS.test(holder) || ELECTRIC_CONTRACTORS.test(holder)) {
    const owner = XCEL.test(holder) ? 'Xcel Energy' : 'Other permit holder';
    if (GAS_CONTRACTORS.test(holder)) return work('gas', owner);
    if (ELECTRIC_CONTRACTORS.test(holder)) return work('electric', owner);
    // Denver's permits carry no description, so only the holder's own trade can say
    // ("Xcel Energy - Electric"); otherwise gas, marked assumed.
    const [energy] = energyWork('', { holder, fallback: 'gas' });
    return work(energy!.utility, owner, energy!.assumed);
  }
  const utility = UTILITIES.find(([pattern]) => pattern.test(holder));
  if (utility) return work(utility[2], utility[1]);
  if (TELECOM_CONTRACTORS.test(holder)) return work('telecom', 'Other permit holder');
  if (SEWER_TRADES.test(holder)) return work('sewer', 'Other permit holder');
  return null;
};
