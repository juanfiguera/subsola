import type { UtilityKind } from '../../src/utilities';
import { energyWork } from '../gasOrElectric';

/**
 * San Francisco's street-use permits name who holds the permit (`agent`) and a free-text purpose,
 * never the utility. A utility company's own permit is its utility; a contractor's counts only
 * when the purpose names the work. See docs/regions/sf.md.
 */

export interface SfWork {
  utility: UtilityKind;
  /** The company as people know it, or the agent as written for a contractor. */
  owner: string;
  /** The work is on a main, not a service or connection. */
  main: boolean;
  /** PG&E didn't say gas or electric, so gas was assumed. */
  assumed: boolean;
}

const COMPANIES: [RegExp, string, UtilityKind][] = [
  [/san francisco water|sfpuc|s\.?f\.? water|hetch hetchy/i, 'SFPUC', 'water'],
  [/bureau of street ?& ?sewer|sewer repair/i, 'SF Public Works', 'sewer'],
  [/nrg energy|energy center san francisco|clearway/i, 'Energy Center San Francisco', 'steam'],
  [/pacific bell|\bsbc\b|\bat ?& ?t\b/i, 'AT&T', 'telecom'],
  [/comcast/i, 'Comcast', 'telecom'],
  [/cablecom/i, 'CableCom', 'telecom'],
  [/astound|\brcn\b|wave broadband/i, 'Astound', 'telecom'],
  [/zayo/i, 'Zayo', 'telecom'],
  [/extenet/i, 'ExteNet', 'telecom'],
  [/qwest|centurylink|lumen|level 3/i, 'Lumen', 'telecom'],
  [/\bmci|verizon|\bxo comm/i, 'Verizon', 'telecom'],
  [/above ?net/i, 'Zayo (AboveNet)', 'telecom'],
  [/department of technology/i, 'SF Department of Technology', 'telecom'],
  // Fiber builders and cable crews, who dig for whichever carrier hires them.
  [
    /crown castle|mobilitie|sonic|webpass|monkeybrains|lightworks|communications|telecom|cable|fiber/i,
    'Telecom provider',
    'telecom',
  ],
];

const PGE = /pacific gas|\bpg ?& ?e\b|\bpg and e\b/i;

// What a contractor's purpose names; every match counts, so "Water Main Installation and Sewer
// Replacement" files under both. SFPUC numbers its water contracts WD- and its sewer ones WW-.
// PG&E alone doesn't name a utility, so a contractor's purpose that mentions it is read for gas or
// electric (pipeline/gasOrElectric.ts) rather than counted as gas here.
const PURPOSE_RULES: [RegExp, UtilityKind][] = [
  [/\bgas\b/i, 'gas'],
  [/sewer|\bww-?\d|storm drain|catch basin|culvert/i, 'sewer'],
  [/water|\bwd-?\d|hydrant|\bawss\b/i, 'water'],
  [/fiber|telecom|at ?& ?t|comcast|verizon|\bnode\b|small cell/i, 'telecom'],
  [/electric|transformer/i, 'electric'],
  [/steam/i, 'steam'],
];

const isMain = (purpose: string) =>
  /\bmains?\b|gprp|\bmwc ?14|\bdip\b|\btransmission\b/i.test(purpose);

/** Each utility a permit dug for. Paving, curb ramps and sidewalk work come back empty. */
export const classifySfPermit = (
  agent: string | null | undefined,
  purpose: string | null | undefined,
): SfWork[] => {
  const who = agent?.trim() ?? '';
  const what = purpose?.trim() ?? '';
  const main = isMain(what);
  // When nothing says gas or electric, PG&E's work is filed as gas, marked assumed: gas is the
  // cautious guess for someone about to dig (docs/regions/sf.md). Some permits are filed as
  // "PG&E - Gas" or "PG&E - Electricity", which says it.
  if (PGE.test(who)) {
    const filedAs = who.match(/- ?(gas|electricity)$/i)?.[1] ?? '';
    return energyWork(`${what} ${filedAs}`, { fallback: 'gas' }).map((work) => ({
      ...work,
      owner: 'PG&E',
      main,
    }));
  }
  const company = COMPANIES.find(([pattern]) => pattern.test(who));
  if (company) {
    // SFPUC runs the sewers as well as the water.
    const utility = company[1] === 'SFPUC' && /sewer/i.test(what) ? 'sewer' : company[2];
    return [{ utility, owner: company[1], main, assumed: false }];
  }
  const found = new Set<UtilityKind>();
  for (const [pattern, utility] of PURPOSE_RULES) if (pattern.test(what)) found.add(utility);
  const own = [...found].map((utility) => ({
    utility,
    owner: who || 'Unknown',
    main,
    assumed: false,
  }));
  if (!PGE.test(what)) return own;
  // A contractor digging for PG&E ("conduits for PG&E power"); its other work stays.
  const others = own.filter((work) => work.utility !== 'gas' && work.utility !== 'electric');
  const pge = energyWork(what, { holder: who, fallback: 'gas', otherWork: others.length > 0 });
  return [...pge.map((work) => ({ ...work, owner: who || 'Unknown', main })), ...others];
};
