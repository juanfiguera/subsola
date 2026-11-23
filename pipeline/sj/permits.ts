import type { UtilityKind } from '../../src/utilities';
import { energyWork } from '../gasOrElectric';

/**
 * San Jose's utility permits name no company. What they do carry is the permit number, which
 * Public Works letters by the kind of utility that filed it: E for PG&E, W for San Jose Water, G
 * for Great Oaks Water, T for the phone company, H for cable, F for fiber, SC for small cells,
 * and an S in front for a special (major) permit, as in SE or SW. The free-text description says
 * the rest: gas or electric for PG&E, which telecom company, whether the work is up a pole, and
 * whether the street is opened at all. The description is read here and never stored; the map
 * shows only what's worked out from it. A permit with no letter (most never issued) is read from
 * its description alone. See docs/regions/sj.md.
 */

export interface SjWork {
  utility: UtilityKind;
  owner: string;
  /** PG&E didn't say gas or electric, so electric, its more common work here, was assumed. */
  assumed: boolean;
  /** The description says the street isn't opened: an access or traffic control permit. */
  noOpening?: true;
}

export type SjSkip = 'small cell' | 'overhead' | 'no utility named';

/** Shown where the permit names no owner Subsola can tell: a contractor, a builder or a person. */
export const OTHER_HOLDER = 'Other permit holder';

type ClassOwner = { utility: UtilityKind | 'energy'; owner: string | null } | 'small cell';

// The letters Public Works gives each kind of permit, as the 2019 to 2026 records bear out: every
// E or SE permit that names a company names PG&E, W permits sit in San Jose Water's service area
// and G permits in Great Oaks Water's (the city's water service provider layer), T permits name
// only AT&T and H permits only Comcast.
const CLASSES: Record<string, ClassOwner> = {
  E: { utility: 'energy', owner: 'PG&E' },
  W: { utility: 'water', owner: 'San Jose Water' },
  G: { utility: 'water', owner: 'Great Oaks Water' },
  T: { utility: 'telecom', owner: 'AT&T' },
  H: { utility: 'telecom', owner: 'Comcast' },
  F: { utility: 'telecom', owner: null },
  SC: 'small cell',
};

/** The class letters at the front of a permit number: "SE230411S" is SE, read as E. */
export const sjPermitClass = (reference: string | null | undefined): ClassOwner | null => {
  const letters = /^([A-Z]+)\d/.exec(reference?.trim().toUpperCase() ?? '')?.[1];
  if (!letters) return null;
  if (CLASSES[letters]) return CLASSES[letters];
  // A special permit: S and the class.
  return letters.startsWith('S') ? (CLASSES[letters.slice(1)] ?? null) : null;
};

const PGE = /\bPG ?& ?E\b|\bPGE\b|pacific gas/i;

const TELECOMS: [RegExp, string][] = [
  [/\bAT ?& ?T\b|\bATT\b|pacific bell/i, 'AT&T'],
  [/comcast/i, 'Comcast'],
  [/verizon|\bMCI\b/i, 'Verizon'],
  [/\bzayo\b/i, 'Zayo'],
  [/crown castle/i, 'Crown Castle'],
  [/\bsonic\b/i, 'Sonic'],
  [/\blumen\b|level ?3|centurylink/i, 'Lumen'],
  [/\bT-?Mobile\b/i, 'T-Mobile'],
  [/google fiber|webpass/i, 'Google Fiber'],
  [/astound|\bwave broadband\b/i, 'Astound'],
  [/extenet/i, 'ExteNet'],
];

const SJW = /\bSJWC?\b|san jose water/i;
const GREAT_OAKS = /great oaks water|\bGOWC?\b/i;

// Words for a water job: San Jose Water's crews write "short service" and "long service" for the
// two ends of a service line, and DICL for the ductile iron main it lays.
const WATER =
  /\bwater (service|main|line|meter|leak|valve)|hydrant|\bDICL\b|fire (protection )?service|\b(short|long) (side )?service\b|\bK ?& ?R\b|(gate|air) valve|blow ?off/i;
const SEWER = /\bsewer\b|sanitary|storm (drain|main|line|pipe)|\bSSMH\b/i;
const GAS = /\bgas (service|main|leak|line|meter|pipe)/i;
const TELECOM_WORK = /\bfiber\b|\bfibre\b|\bCATV\b|telephone|\bcoax\b|copper cable|innerduct/i;

// Up a pole or in the air: poles, lashing cable to a strand, anchors and guys, crossarms, trees.
const OVERHEAD =
  /\bpoles?\b|overhead|\bOH\b|aerial|\b(de|re|over)?-?lash|\banchors?\b|\bguys?\b|guy wire|cross ?arm|\btrees?\b|vegetation|\bcrane\b|strand|\bspan\b/i;
// Anything that goes into the ground or under it.
const UNDERGROUND =
  /trench|\bbor(e|es|ed|ing)\b|excavat|\bdig|conduit|underground|\bUG\b|vault|\bHH'?s?\b|hand ?holes?|splice box|secondary box|\bSB'?s?\b|pull ?box|pedestal|\bpeds?\b|enclosure|pad ?mount|bell ?hole|pot ?hol|riser|substructure|manhole|\bMH'?s?\b|saw ?cut|asphalt|concrete|\bpits?\b|backfill|tie[- ]in/i;
// Said outright: the street isn't opened. "No asphalt excavation" still digs the parkstrip, and
// "no excavation in the street" can still dig the sidewalk, so those don't count.
const NO_OPENING =
  /\bno excavation\b(?! (in|on|within) (the )?(street|asphalt|sidewalk|parkstrip|roadway))|no digging|no ground disturbance|traffic control only|no construction within (the )?(city )?(right[- ]of[- ]way|r\.?o\.?w)/i;
const NO_OPENING_ALL = new RegExp(NO_OPENING.source, 'gi');
// Digging the description names anyway, which outweighs a "no excavation" elsewhere in it.
const DIGS = /excavate|\bdig\b|dig up|digging|trench|\bbor(e|es|ing)\b|bell ?hole|\bpits?\b/i;
// The crews' shorthand that energyWork's words miss: TX is a transformer.
const ELECTRIC_SHORTHAND = /\bTXS?\b|\bXFMR\b/gi;
// PG&E's gas work as its San Jose crews write it: steel (STL) and plastic (PL) mains and services,
// "1/2 in PL", inserting a new service in the old one, and the bellholes dug to find a leak.
const GAS_SHORTHAND =
  /\b(STL|steel|PL|plastic) (main|service)s?\b|\d"? ?(STL|PL)\b|service at (the )?main|branch service|insertion|bell ?holes?/i;
// And its electric work: capacitors, crossarms, grounds, conductors, reclosers, a building's
// panel, and tying its service in hot.
const ELECTRIC_HINTS =
  /capacitor|\barm\b|ground (rod|wire)s?|hot tie[- ]?ins?|conductor|recloser|\bpanel\b|\bamps?\b/i;

/** The telecom company the description names, if any. */
const telecomNamed = (text: string) => TELECOMS.find(([pattern]) => pattern.test(text))?.[1];

/** Gas and electric for a PG&E permit, from what the work says; electric when it says neither. */
const pgeWork = (text: string): SjWork[] => {
  const said = [
    text.replace(ELECTRIC_SHORTHAND, 'transformer'),
    GAS_SHORTHAND.test(text) ? 'gas' : '',
    ELECTRIC_HINTS.test(text) ? 'electric' : '',
  ].join(' ');
  return energyWork(said, { fallback: 'electric' }).map((work) => ({ ...work, owner: 'PG&E' }));
};

/** The utility a permit with no usable letter dug for, from its description alone. */
const fromText = (text: string): SjWork[] => {
  if (PGE.test(text)) return pgeWork(text);
  const telecom = telecomNamed(text);
  if (telecom) return [{ utility: 'telecom', owner: telecom, assumed: false }];
  if (GREAT_OAKS.test(text))
    return [{ utility: 'water', owner: 'Great Oaks Water', assumed: false }];
  if (SJW.test(text)) return [{ utility: 'water', owner: 'San Jose Water', assumed: false }];
  // PG&E is the only gas utility in San Jose, so a gas dig is on its line.
  if (GAS.test(text)) return [{ utility: 'gas', owner: 'PG&E', assumed: false }];
  if (WATER.test(text)) return [{ utility: 'water', owner: OTHER_HOLDER, assumed: false }];
  if (SEWER.test(text)) return [{ utility: 'sewer', owner: OTHER_HOLDER, assumed: false }];
  if (TELECOM_WORK.test(text)) return [{ utility: 'telecom', owner: OTHER_HOLDER, assumed: false }];
  return [];
};

/**
 * Each utility a permit dug for, or why it's left out. `reference` is the permit number,
 * `workType` the city's pick list (Standard, Emergency, Special, Small Cell, Fiber) and
 * `description` the free text, read only here.
 */
export const classifySjPermit = (
  reference: string | null | undefined,
  workType: string | null | undefined,
  description: string | null | undefined,
): SjWork[] | SjSkip => {
  const text = (description ?? '').replace(/\s+/g, ' ').trim();
  const known = sjPermitClass(reference);
  if (known === 'small cell' || workType?.trim() === 'Small Cell') return 'small cell';

  let works: SjWork[];
  if (known?.utility === 'energy') works = pgeWork(text);
  else if (known?.utility === 'telecom')
    works = [
      {
        utility: 'telecom',
        owner: telecomNamed(text) ?? known.owner ?? OTHER_HOLDER,
        assumed: false,
      },
    ];
  else if (known)
    works = [{ utility: known.utility, owner: known.owner ?? OTHER_HOLDER, assumed: false }];
  else if (workType?.trim() === 'Fiber')
    works = [{ utility: 'telecom', owner: telecomNamed(text) ?? OTHER_HOLDER, assumed: false }];
  else works = fromText(text);
  if (!works.length) return 'no utility named';

  // Poles, lashing and tree work that say nothing of going into the ground are up in the air. Gas
  // and water are always underground, so a gas line the text names stays. "No excavation" names
  // no digging, so it's set aside first.
  const workText = text.replace(NO_OPENING_ALL, ' ');
  const noOpening = NO_OPENING.test(text) && !DIGS.test(workText);
  if (OVERHEAD.test(workText) && !UNDERGROUND.test(workText)) {
    works = works.filter(
      (work) => work.utility !== 'electric' && work.utility !== 'telecom' && !work.assumed,
    );
    if (!works.length) return 'overhead';
  }
  return noOpening ? works.map((each) => ({ ...each, noOpening: true })) : works;
};

export const isSjSkip = (value: SjWork[] | SjSkip): value is SjSkip => typeof value === 'string';
