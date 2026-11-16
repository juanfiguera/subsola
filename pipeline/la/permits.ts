import type { UtilityKind } from '../../src/utilities';

/**
 * LA's excavation (U) permits name no company and no work, only a contact. Who dug is read from
 * the domain of the contact's email, and nothing else of it is kept. LADWP runs both water and
 * power and its permits don't say which; they're filed as water, since every LA street has a
 * water main, and marked as assumed. See docs/regions/la.md.
 */

export interface LaWork {
  utility: UtilityKind;
  owner: string;
  /** LADWP didn't say water or power, so water was assumed. */
  assumed: boolean;
}

// The email field is cut at 30 characters, so a domain can end early ("socalgas.c", "ladwp.").
const DOMAINS: [RegExp, string, UtilityKind][] = [
  [/^water\.ladwp/, 'LADWP', 'water'],
  [/^(socalgas|semprautilities|sempra|scgcontractor)\b/, 'SoCalGas', 'gas'],
  [/^sce\./, 'Southern California Edison', 'electric'],
  [/^(att|wemail\.att|sbc|pacbell)\./, 'AT&T', 'telecom'],
  [/^(twcable|charter|spectrum|chartercom)\./, 'Spectrum', 'telecom'],
  [/^(verizon|verizonwireless|mci)\./, 'Verizon', 'telecom'],
  [/^cox\./, 'Cox', 'telecom'],
  [
    /^(crowncastle|zayo|lumen|level3|centurylink|extenet|mobilitie)\./,
    'Telecom provider',
    'telecom',
  ],
  // Engineering firms that file permits for wireless and cable carriers.
  [
    /^(md7|eukongroup|vinculums|cyient|vvdcomm|ospros|fjscable|cableeng|hpcomminc)\./,
    'Telecom contractor',
    'telecom',
  ],
];

/** The domain of an email address, lower case: "jane@socalgas.com" to "socalgas.com". */
export const emailDomain = (email: string | null | undefined): string | null => {
  const at = email?.indexOf('@') ?? -1;
  if (!email || at < 0) return null;
  // Several addresses can share the field; the first one counts.
  return (
    email
      .slice(at + 1)
      .split(/[,;\s]/)[0]!
      .trim()
      .toLowerCase() || null
  );
};

/** The utility a permit dug for, or null for a contractor who could be working for anyone. */
export const classifyLaPermit = (email: string | null | undefined): LaWork | null => {
  const domain = emailDomain(email);
  if (!domain) return null;
  if (/^ladwp\b/.test(domain)) return { utility: 'water', owner: 'LADWP', assumed: true };
  const match = DOMAINS.find(([pattern]) => pattern.test(domain));
  return match ? { utility: match[2], owner: match[1], assumed: false } : null;
};
