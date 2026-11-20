import type { UtilityKind } from '../../src/utilities';
import { chiHolderName, HOLDER_HIDDEN } from '../chi/permits';

/**
 * Dallas's right of way permits say, in the city's own pick list, which utility the work is for
 * ("Gas", "Wastewater", "Telecommunications") and why ("New Service", "Repair Existing Service").
 * That settles the utility. The applicant's company is typed by hand and often carries a crew
 * member's name ("Atmos Energy Corp James Tidwell"), so it never leaves the portal: the portal is
 * asked only which of a few known owners it names. The free-text work description, where people
 * type phone numbers, stays there too; the portal is asked only whether it mentions a few words,
 * as for Chicago. Gas and power are different companies here (Atmos Energy, Oncor), so gas or
 * electric is never a guess. See docs/regions/dal.md.
 */

export type DalTopic = 'overhead' | 'underground' | 'crossBore' | 'main' | 'water' | 'sewer';

/**
 * Words the portal looks for in the work description, upper-cased and padded with a space at each
 * end. A leading space keeps "POLE" out of "NAPOLEON"; " DUCT" keeps "RECONDUCTOR" from reading as
 * a duct bank.
 */
export const DAL_TOPIC_WORDS: Record<DalTopic, string[]> = {
  // Oncor's pole, crossarm and streetlight swaps and the cable companies' lashing, up in the air.
  overhead: [
    'AERIAL',
    'OVERHEAD',
    ' POLE',
    'CAPACITOR',
    'RECONDUCT',
    'CROSSARM',
    'CROSS ARM',
    'CROSS-ARM',
    'GUY WIRE',
    ' LASH',
    'STREETLIGHT',
    'STREET LIGHT',
    'FIXTURE',
    'ARRESTER',
    'RECLOSER',
  ],
  underground: [
    'BORE',
    'BORING',
    'TRENCH',
    'CONDUIT',
    'UNDERGROUND',
    ' UG ',
    ' URD',
    ' DUCT',
    'VAULT',
    'MANHOLE',
    'HANDHOLE',
    'HAND HOLE',
    ' CUT',
    'SAWCUT',
    'EXCAVAT',
    ' DIG',
    'PEDESTAL',
    'RISER',
    'BURIED',
    ' BURY',
    'POTHOL',
    'HYDROVAC',
    'HYDRO VAC',
    'SPLICE',
    ' PIT ',
    'PAD MOUNT',
    'PADMOUNT',
    'SECONDARY BOX',
    'PULL BOX',
  ],
  // Atmos camera-checks the sewers along its new gas lines for a bore that went through one.
  crossBore: ['CROSS BORE', 'CROSSBORE', 'CROSS-BORE'],
  main: [' MAIN ', ' MAINS ', ' MAIN.', ' MAIN,', 'MAINLINE'],
  // " WATER" with its space, so "WASTEWATER" doesn't count.
  water: [' WATER', 'HYDRANT', ' METER', 'VALVE'],
  sewer: ['SEWER', 'WASTEWATER', 'LATERAL', 'CLEANOUT', 'CLEAN OUT', 'MANHOLE'],
};

export type DalTopics = Partial<Record<DalTopic, number | boolean | null>>;

/**
 * The owners the portal looks for in the applicant's company, as `LIKE` patterns on the upper-cased
 * name, first match wins. Anything else, a contractor, a builder or a person, comes back empty.
 */
export const DAL_HOLDERS: [string, string[]][] = [
  ['Atmos Energy', ['%ATMOS%']],
  ['Oncor', ['%ONCOR%']],
  [
    'Dallas Water Utilities',
    [
      'DWU%',
      '% DWU%',
      '%WATER UTI%',
      '%WATER UTL%',
      '%WATER DEP%',
      '%DALLA WATER%',
      '%WASTEWATER%',
      'CITY OF DALLAS WATER%',
    ],
  ],
  ['AT&T', ['%AT&T%', '%AT &T%', '%AT & T%', '%AT& T%', 'ATT', 'ATT %']],
  ['Charter (Spectrum)', ['%CHARTER%', '%SPECTRUM%']],
  ['Crown Castle', ['%CROWN CASTLE%']],
  ['ExteNet', ['%EXTENET%']],
  ['Verizon', ['%VERIZON%', 'MCI%']],
  ['Zayo', ['%ZAYO%']],
  ['Lumen', ['%LUMEN%', '%CENTURYLINK%', '%CENTURY LINK%', '%LEVEL%3%']],
  ['FiberLight', ['%FIBERLIGHT%']],
  ['Sonic', ['SONIC%']],
  ['Unite Private Networks', ['%UNITE PRIVATE%']],
  ['Segra', ['%SEGRA%']],
  ['T-Mobile', ['%T-MOBILE%', '%T MOBILE%']],
  ['DART', ['DART%', '%AREA RAPID%']],
  [
    'City of Dallas',
    [
      '%CITY%DALLAS%',
      '%CIT OF DALLAS%',
      '%PUBLIC WORK%',
      '%PBW%',
      'COD %',
      'DEPARTMENT%OF%PUBLIC%',
    ],
  ],
];

const TELECOMS = new Set([
  'AT&T',
  'Charter (Spectrum)',
  'Crown Castle',
  'ExteNet',
  'Verizon',
  'Zayo',
  'Lumen',
  'FiberLight',
  'Sonic',
  'Unite Private Networks',
  'Segra',
  'T-Mobile',
]);

/** The pick list's improvement types that name a utility. */
const BY_IMPROVEMENT: Record<string, UtilityKind> = {
  Gas: 'gas',
  Water: 'water',
  Wastewater: 'sewer',
  Stormwater: 'sewer',
  Electric: 'electric',
  Telecommunications: 'telecom',
};

/**
 * Paving types: a utility's own paving permit is the street put back over its dig, kept like
 * Chicago's restorations, showing the line is there without counting as a dig.
 */
const PAVING = new Set(['Street Paving', 'Alley Paving', 'Sidewalk', 'Drive Approach']);

/** Every improvement type the download asks for; the rest (ramps, "None") never cut for a utility. */
export const DAL_IMPROVEMENTS = [...Object.keys(BY_IMPROVEMENT), ...PAVING, 'Other'];

export interface DalWork {
  utility: UtilityKind;
  /** Whose line it most likely is, or the company that held the permit. */
  owner: string;
  /** A DWU paving permit said neither water nor sewer, so water was assumed. */
  assumed: boolean;
  /** The street isn't opened: a camera run down a sewer, or a paving permit after the dig. */
  noOpening?: 'cross bore check' | 'paving';
}

export type DalSkip = 'not a utility' | 'overhead' | 'small cell' | 'no utility named';

/** Shown where the holder is no owner the portal knows: a contractor, a builder or a person. */
export const OTHER_HOLDER = 'Other permit holder';

const work = (utility: UtilityKind, owner: string, extra: Partial<DalWork> = {}): DalWork => ({
  utility,
  owner,
  assumed: false,
  ...extra,
});

/**
 * Who owns a line of `utility` here. Atmos is the only gas utility inside the city, so a
 * contractor's gas dig is on Atmos's line. Power, water and sewer digs by others may be a city
 * streetlight circuit or a building's own service, so they keep the holder.
 */
const ownerFor = (utility: UtilityKind, holder: string | null) =>
  utility === 'gas' ? 'Atmos Energy' : (holder ?? OTHER_HOLDER);

/**
 * The utility a permit was for, or why it's left out. `holder` is the owner the portal found in
 * the company, or null; `topics` are the words it found in the work description.
 */
export const classifyDalPermit = (
  improvement: string | null | undefined,
  holder: string | null | undefined,
  topics: DalTopics,
): DalWork | DalSkip => {
  const kind = improvement?.trim() ?? '';
  const owner = holder?.trim() || null;
  if (kind.startsWith('Small Cell')) return 'small cell';

  const named = BY_IMPROVEMENT[kind];
  if (named) {
    // A sewer camera checking for Atmos's bores: the sewer is there, the street isn't opened.
    if (named === 'sewer' && topics.crossBore)
      return work('sewer', 'Dallas Water Utilities', { noOpening: 'cross bore check' });
    // Poles, crossarms and lashing that say nothing of going underground are up on the poles.
    if ((named === 'electric' || named === 'telecom') && topics.overhead && !topics.underground)
      return 'overhead';
    // Oncor lays fiber for its own grid.
    if (named === 'telecom') return work('telecom', owner ?? OTHER_HOLDER);
    return work(named, ownerFor(named, owner));
  }

  if (PAVING.has(kind)) {
    if (owner === 'Atmos Energy') return work('gas', owner, { noOpening: 'paving' });
    if (owner === 'Oncor') return work('electric', owner, { noOpening: 'paving' });
    if (owner === 'Dallas Water Utilities')
      return work(topics.sewer && !topics.water ? 'sewer' : 'water', owner, {
        noOpening: 'paving',
        assumed: !topics.sewer && !topics.water,
      });
    if (owner && TELECOMS.has(owner)) return work('telecom', owner, { noOpening: 'paving' });
    return 'not a utility';
  }

  // "Other": dumpsters, cameras, soil borings, driveways. Only a utility's own permit counts.
  if (kind === 'Other') {
    if (topics.overhead && !topics.underground) return 'overhead';
    if (owner === 'Atmos Energy') return work('gas', owner);
    if (owner === 'Oncor') return work('electric', owner);
    // DWU files its creek erosion repairs here too, so only a permit naming water or sewer work.
    if (owner === 'Dallas Water Utilities') {
      if (topics.sewer && !topics.water) return work('sewer', owner);
      if (topics.water) return work('water', owner);
      return 'no utility named';
    }
    if (owner && TELECOMS.has(owner)) return work('telecom', owner);
    return 'no utility named';
  }
  return 'not a utility';
};

export const isDalSkip = (value: DalWork | DalSkip): value is DalSkip => typeof value === 'string';

// Dallas's big utility contractors, whose names carry none of Chicago's company words.
const DAL_COMPANY = /\b(PIPELINE|UNDERGROUND|INFRASTRUCTURE|TELECOMMUNICATIONS|PRIMORIS|MASTEC)\b/;

// A suffix the list's commas cut off its company: "Boardwalk Paving & Construction, LLC".
const SUFFIX = /^(LLC|L\.L\.C\.?|INC\.?|LTD\.?|CORP\.?|CO\.?|LP|LLP)$/i;

/**
 * The first contractor on the permit that reads as a company, for a permit whose holder is no
 * known owner; null when none does. The list is typed by hand, commas between, and now and then
 * names a person, who is never shown (the same test as Chicago's holders).
 */
export const dalContractor = (all: string | null | undefined): string | null => {
  const names: string[] = [];
  for (const piece of (all ?? '').split(',')) {
    const name = piece.trim();
    if (!name) continue;
    if (SUFFIX.test(name) && names.length) names[names.length - 1] += `, ${name}`;
    else names.push(name);
  }
  for (const name of names) {
    const company = chiHolderName(name);
    if (company !== HOLDER_HIDDEN) return company;
    if (DAL_COMPANY.test(name.toUpperCase()) && !/\bD\/?B\/?A\b/i.test(name))
      return name.replace(/\s+/g, ' ');
  }
  return null;
};
