import type { UtilityKind } from '../../src/utilities';

/**
 * DDOT's public space permits list their work as "Category; Detail" items, e.g.
 * "Excavation; Gas Main Line (Trench), Excavation; Manhole Installation". Most details name the
 * utility; the rest (a manhole, a vault, a test pit) are read from who holds the permit, which in
 * DC is usually the utility itself rather than a contractor.
 */

export interface DcWork {
  utility: UtilityKind;
  /** The item is on a main ("ML", "Main Line"), not a service or connection. */
  main: boolean;
  detail: string;
}

/** The excavation details of a permit, in order, without their "Excavation;" prefix. */
export const excavationItems = (typeDetailNames: string | null | undefined): string[] =>
  (typeDetailNames ?? '')
    // Items are joined with ", " but details can't contain "Word;", so split before each category.
    .split(/,\s*(?=[A-Z][A-Za-z' ]*;)/)
    .map((item) => item.trim())
    .filter((item) => /^Excavation;/i.test(item))
    .map((item) => item.replace(/^Excavation;\s*/i, '').replace(/\s+/g, ' '));

// First match wins: "Storm Lateral" is a sewer, not water; "Water Proofing" is neither.
const DETAIL_RULES: [RegExp, UtilityKind | null][] = [
  [/water ?proofing|tree space|front yard|sheeting|monitoring well|paving/i, null],
  [/steam/i, 'steam'],
  [/\bgas\b|cathodic/i, 'gas'],
  [/sewer|storm|catch basin|clean ?out|inlet/i, 'sewer'],
  [/water|hydrant/i, 'water'],
  [/electric/i, 'electric'],
  [/telecom|fiber|crown castle|cable/i, 'telecom'],
];

// Work that any utility does; whose it is comes from the permittee.
const GENERIC =
  /manhole|vault|handhole|keyhole|tap hole|valve|house connections|test pit|boring|camera/i;

const COMPANIES: [RegExp, string, UtilityKind][] = [
  [/wash(ington)?\.? ?gas|wgl\b/i, 'Washington Gas', 'gas'],
  [/dc ?water|wasa\b/i, 'DC Water', 'water'],
  [/pepco|potomac electric/i, 'Pepco', 'electric'],
  [/verizon/i, 'Verizon', 'telecom'],
  [/comcast/i, 'Comcast', 'telecom'],
  [/rcn|starpower|astound/i, 'Astound (RCN)', 'telecom'],
  [/zayo/i, 'Zayo', 'telecom'],
  [/crown castle|lightower|fibertech/i, 'Crown Castle', 'telecom'],
  [/\bat&t\b|\bat & t\b/i, 'AT&T', 'telecom'],
  [/level 3|lumen|centurylink/i, 'Lumen', 'telecom'],
  [/cogent/i, 'Cogent', 'telecom'],
];

/** The company as people know it, and the utility it runs, when the permittee is one of them. */
export const dcCompany = (
  permittee: string | null | undefined,
): { name: string; utility: UtilityKind } | null => {
  if (!permittee) return null;
  const match = COMPANIES.find(([pattern]) => pattern.test(permittee));
  return match ? { name: match[1], utility: match[2] } : null;
};

const isMain = (detail: string) => /\bML\b|main/i.test(detail);

/** Each utility the permit dug for, with whether any of its items was on a main. */
export const classifyDcPermit = (
  typeDetailNames: string | null | undefined,
  permittee: string | null | undefined,
): DcWork[] => {
  const company = dcCompany(permittee);
  const found = new Map<UtilityKind, DcWork>();
  for (const detail of excavationItems(typeDetailNames)) {
    const rule = DETAIL_RULES.find(([pattern]) => pattern.test(detail));
    let utility: UtilityKind | null | undefined = rule?.[1];
    if (utility === undefined && GENERIC.test(detail) && company) {
      // DC Water's manholes are on its sewers; its other generic work (valves, vaults) is water.
      utility = company.utility === 'water' && /manhole/i.test(detail) ? 'sewer' : company.utility;
    }
    if (!utility) continue;
    const known = found.get(utility);
    found.set(utility, {
      utility,
      main: (known?.main ?? false) || isMain(detail),
      detail: known ? `${known.detail}; ${detail}` : detail,
    });
  }
  return [...found.values()];
};
