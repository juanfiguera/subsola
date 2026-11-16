import type { UtilityKind } from '../../src/utilities';

/**
 * Chicago's public way opening permits name the company that holds them and, in free text, what
 * the work is. The text is never downloaded: the portal is asked only whether it mentions a few
 * words ("water", "gas", "fiber"), so a name or phone number typed into it stays on the portal.
 * The company settles most permits: the Department of Water Management (DWM) runs water and the
 * sewers, Peoples Gas gas, ComEd power. A contractor's permit counts only where its text names
 * the utility. Tree planting, sidewalks and paving open the street too, and are left out.
 * See docs/regions/chi.md.
 */

export type ChiTopic =
  'water' | 'sewer' | 'gas' | 'electric' | 'telecom' | 'light' | 'main' | 'tree';

/**
 * Words the portal looks for in the permit's name and comments, upper-cased and padded with a
 * space at each end. A leading space keeps "STREET" from reading as "TREE" and "VEGAS" as "GAS".
 * Water Management's crews write in shorthand: a leak in the parkway, a defective b-box (the curb
 * stop on a service), a valve basin; a catch basin outlet (CBO), gutter box inlet (GBI) or private
 * drain (P/D) is sewer work.
 */
export const CHI_TOPIC_WORDS: Record<ChiTopic, string[]> = {
  water: [
    'WATER',
    'HYDRANT',
    'B-BOX',
    'B BOX',
    'B.BOX',
    'B. BOX',
    'BBOX',
    'DEF BOX',
    'DEFECTIVE BOX',
    'LSLR',
    'LEAD SERV',
    ' LEAK',
    'VALVE',
    'METER VAULT',
  ],
  sewer: [
    'SEWER',
    'CATCH BASIN',
    'DRAIN',
    ' CB ',
    ' CB/',
    ' CBO',
    ' C/B',
    'GBI',
    'GUTTER BOX',
    'MANHOLE',
    'MAN HOLE',
    ' P/D',
    ' PD ',
  ],
  gas: [' GAS'],
  electric: ['ELECTRIC', 'COMED', 'TRANSFORMER', ' POWER'],
  telecom: ['FIBER', 'TELECOM', 'COMMUNICATION', 'SMALL CELL', 'WIRELESS', 'TELEPHONE', ' CATV'],
  light: ['STREET LIGHT', 'STREETLIGHT', 'LIGHT POLE', 'LIGHTING', 'TRAFFIC SIGNAL'],
  main: [' MAIN ', ' MAINS ', ' WM '],
  tree: [' TREE', ' STUMP', 'PLANTING'],
};

export type ChiTopics = Partial<Record<ChiTopic, boolean | null>>;

export interface ChiWork {
  utility: UtilityKind;
  /** Who the line belongs to, or the company that held the permit, as shown. */
  owner: string;
  /** DWM didn't say water or sewer, so water was assumed. */
  assumed: boolean;
}

/** The people's names some holders file under; what the cards and insights show instead. */
export const HOLDER_HIDDEN = 'Holder not shown (may be a person)';

const DWM = /^DWM\b|\bDWM\b|water management/i;
const PEOPLES_GAS = /peoples gas|integrys/i;
const COMED = /\bcom ?ed\b|commonwealth edison/i;
const MWRD = /\bMWRD\b|metropolitan water reclamation/i;
// The city's street crews and contractors: alleys, ramps and sidewalks, filed as the city's own
// work. Its electrical crews lay the street light and signal cable.
const CDOT_ELECTRICAL = /^CDOT\b.*electric/i;
const CDOT = /^CDOT\b|department of transportation/i;
// Signs, trees and the CTA's tracks open the street for something that isn't a utility.
const NOT_UTILITY = /sign management|forestry|\bDSS\b|^CTA\b|chicago transit/i;

const UTILITIES: [RegExp, string, UtilityKind][] = [
  [/\bAT ?& ?T\b|\bSBC\b|illinois bell/i, 'AT&T', 'telecom'],
  [/comcast/i, 'Comcast', 'telecom'],
  [/verizon|\bMCI\b/i, 'Verizon', 'telecom'],
  [/crown castle/i, 'Crown Castle', 'telecom'],
  [/\bzayo\b/i, 'Zayo', 'telecom'],
  [/level 3|\blumen\b|century ?link/i, 'Lumen', 'telecom'],
  [/\bRCN\b|astound/i, 'Astound (RCN)', 'telecom'],
  [/\bWOW\b|wide ?open ?west/i, 'WOW', 'telecom'],
  [/sunesys/i, 'Sunesys', 'telecom'],
  [/crosstown fiber/i, 'Crosstown Fiber', 'telecom'],
  [/mobilitie/i, 'Mobilitie', 'telecom'],
  [/lightower|sidera/i, 'Lightower', 'telecom'],
  [/extenet/i, 'ExteNet', 'telecom'],
  [/t-?mobile|sprint/i, 'T-Mobile', 'telecom'],
];

// Contractors whose name says the one utility they work on.
const GAS_CONTRACTORS = /\bNPL\b|miller pipeline/i;
const TELECOM_CONTRACTORS = /telecom|communications|fiber|broadband|wireless|cable/i;
const ELECTRIC_CONTRACTORS = /electric|lighting|city lights/i;
// Plumbers and sewer contractors lay water services and house sewers alike, so their name tells
// only that it's one of the two; the text has to say which.
const SEWER_TRADES = /sewer|rooter|drain/i;

// What reads as a company or agency rather than a person, as for New York's permittees.
const COMPANY =
  /\b(INC|CORP|CORPORATION|CO|COMPANY|LLC|L\.?L\.?C|LTD|LP|LLP|PLLC|DBA|SERVICES?|CONSTRUCTION|CONST|CONTRACTING|CONTRACTORS?|ENTERPRISES?|INDUSTRIES|GROUP|ASSOCIATES|ASSOC|PLUMBING|SEWER|SEWERAGE|WATER|UTILITY|UTILITIES|ELECTRIC|ELECTRICAL|GAS|ENGINEERING|EXCAVATING|EXCAVATION|PAVING|ASPHALT|CEMENT|CONCRETE|LANDSCAPING|MECHANICAL|DEVELOPMENT|PARTNERS|HOLDINGS|TELECOM|COMMUNICATIONS|NETWORKS?|FIBER|ENERGY|TRANSIT|DEPARTMENT|DEPT|CITY|CHICAGO|ILLINOIS|UNIVERSITY|HOSPITAL|SCHOOLS?|PARK|DISTRICT|AUTHORITY|BUREAU|DIVISION|CDOT|DWM|CTA|EXPERT|TREE|ROOTER|DRAINAGE|HEATING|SOLUTIONS|SYSTEMS|PROPERTIES|MANAGEMENT|BUILDERS|DEMOLITION|NURSERY|PARKING|TECHNOLOGIES)\b/;

/**
 * The company as people know it: "SPEEDY GONZALEZ LANDSCAPING, INC. (SL)*" to "SPEEDY GONZALEZ
 * LANDSCAPING, INC.". The portal marks licensed contractors with asterisks and "(SL)" and the
 * like. A sole trader files as "PETER J. SMITH DBA ROYAL PLUMBING", so only the trade name after
 * "DBA" is kept, and a name that doesn't read as a company or agency is never shown.
 */
export const chiHolderName = (holder: string | null | undefined): string => {
  const name = (holder ?? '')
    .split(/\bD\/?B\/?A\b/i)
    .at(-1)!
    .replace(/\*/g, ' ')
    .replace(/\((SL|SEAL|OVERSIZE|CONSTRUCTION)\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s/,]+$/, '')
    .trim();
  return name && COMPANY.test(name.toUpperCase()) ? name : HOLDER_HIDDEN;
};

const work = (utility: UtilityKind, owner: string, assumed = false): ChiWork => ({
  utility,
  owner,
  assumed,
});

/** The utility the text names, in the order that settles a permit naming two. */
const topicUtility = (topics: ChiTopics): UtilityKind | null => {
  if (topics.gas) return 'gas';
  if (topics.water) return 'water';
  if (topics.sewer) return 'sewer';
  if (topics.telecom) return 'telecom';
  if (topics.electric || topics.light) return 'electric';
  return null;
};

/**
 * The utility a permit opened the street for, or null for work that isn't a utility's (trees,
 * sidewalks, paving) or doesn't say. `holder` is the company on the permit, or null where the
 * permit names a person, whom the download never asks for.
 */
export const classifyChiPermit = (
  holder: string | null | undefined,
  topics: ChiTopics,
): ChiWork | null => {
  const company = holder?.trim() ?? '';
  if (DWM.test(company)) {
    // DWM runs the sewers too, and files catch basin and drain repairs under the same name.
    if (topics.sewer && !topics.water) return work('sewer', 'Chicago Water Management');
    return work('water', 'Chicago Water Management', !topics.water);
  }
  if (PEOPLES_GAS.test(company)) return work('gas', 'Peoples Gas');
  if (COMED.test(company)) return work('electric', 'ComEd');
  if (MWRD.test(company)) return work('sewer', 'Metropolitan Water Reclamation District');
  if (CDOT_ELECTRICAL.test(company)) return work('electric', 'CDOT Electrical Operations');
  if (NOT_UTILITY.test(company)) return null;
  if (CDOT.test(company)) return work('capital', 'CDOT');
  const utility = UTILITIES.find(([pattern]) => pattern.test(company));
  if (utility) return work(utility[2], utility[1]);

  // A contractor: the text decides, or the one utility its name says it works on.
  const owner = chiHolderName(company);
  const named = topicUtility(topics);
  if (named) return topics.tree && !topics.water && !topics.sewer ? null : work(named, owner);
  if (GAS_CONTRACTORS.test(company)) return work('gas', owner);
  if (TELECOM_CONTRACTORS.test(company)) return work('telecom', owner);
  if (ELECTRIC_CONTRACTORS.test(company)) return work('electric', owner);
  if (SEWER_TRADES.test(company) && !/water/i.test(company)) return work('sewer', owner);
  return null;
};

/** Work types that open the street, or restore it afterward. */
export const CHI_WORK_TYPES = ['GenOpening', 'WorkInAdv', 'Restorat'] as const;

/** Restoration after another permit's opening, which is no new dig. */
export const isChiRestoration = (workType: string | null | undefined) => workType === 'Restorat';

/**
 * "Work in advance" permits let the city's paving contractors start before the paperwork; only a
 * utility's own count, the emergencies a gas or water crew can't wait on.
 */
export const keepsChiWorkType = (workType: string | null | undefined, work: ChiWork) =>
  workType !== 'WorkInAdv' ||
  ['Chicago Water Management', 'Peoples Gas', 'ComEd'].includes(work.owner) ||
  UTILITIES.some(([, name]) => name === work.owner);
