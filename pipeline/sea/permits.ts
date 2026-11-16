import type { UtilityKind } from '../../src/utilities';

/**
 * Seattle's Street Use permits name the company that holds them, and SDOT's use description
 * says what kind of work it is ("Installing or maintaining natural gas lines ..."). The company
 * settles most: Puget Sound Energy runs only gas in Seattle, City Light only power. Seattle Public
 * Utilities runs water, sewer and drainage; its permits say which most of the time, and when they
 * don't, they're filed as water and marked as assumed. See docs/regions/sea.md.
 */

export interface SeaWork {
  utility: UtilityKind;
  owner: string;
  /** SPU didn't say water or sewer, so water was assumed. */
  assumed: boolean;
}

const COMPANIES: [RegExp, string, UtilityKind][] = [
  [/puget sound energy|\bPSE\b/i, 'Puget Sound Energy', 'gas'],
  [/seattle city light|\bSCL\b/i, 'Seattle City Light', 'electric'],
  [/enwave|seattle steam/i, 'Enwave', 'steam'],
  [/century ?link|\bqwest\b|\blumen\b/i, 'CenturyLink', 'telecom'],
  [/comcast/i, 'Comcast', 'telecom'],
  [/\bzayo\b/i, 'Zayo', 'telecom'],
  [/crown castle/i, 'Crown Castle', 'telecom'],
  [/verizon|\bMCI\b/i, 'Verizon', 'telecom'],
  [/\bwave\b|astound/i, 'Wave Broadband', 'telecom'],
  [/\bAT ?& ?T\b/i, 'AT&T', 'telecom'],
  [/t-?mobile/i, 'T-Mobile', 'telecom'],
];

const SPU = /seattle public utilities|\bSPU\b/i;
const SEWER_WORK = /sewer|drain|storm|culvert|catch basin|\bCB\b|maintenance hole|manhole|outfall/i;
// Sewer cleaners and plumbers mostly fix the building's own side sewer under the street.
const SEWER_TRADES = /sewer|rooter|plumbing|drain|pipelin|pipeworks|gravity flow/i;

/** The utility a permit dug for, or null for a contractor who could be working for anyone. */
export const classifySeaPermit = (
  company: string | null | undefined,
  useType: string | null | undefined,
  useDescription: string | null | undefined,
): SeaWork | null => {
  const holder = company?.trim() ?? '';
  const work = `${useType ?? ''} ${useDescription ?? ''}`;
  if (SPU.test(holder)) {
    if (SEWER_WORK.test(work))
      return { utility: 'sewer', owner: 'Seattle Public Utilities', assumed: false };
    return {
      utility: 'water',
      owner: 'Seattle Public Utilities',
      assumed: !/water|hydrant/i.test(work),
    };
  }
  const match = COMPANIES.find(([pattern]) => pattern.test(holder));
  if (match) return { utility: match[2], owner: match[1], assumed: false };
  if (useType === 'Side Sewer/Drainage' || SEWER_TRADES.test(holder))
    return { utility: 'sewer', owner: 'Other permit holder', assumed: false };
  if (/natural gas/i.test(work))
    return { utility: 'gas', owner: 'Other permit holder', assumed: false };
  if (/water (line|service|main)/i.test(work))
    return { utility: 'water', owner: 'Other permit holder', assumed: false };
  return null;
};
