import type { UtilityKind } from '../../src/utilities';
import { energyWork } from '../gasOrElectric';

/**
 * San Diego's right of way permits name a holder, often a person ("SDGE, Betty Blanford", or just
 * "Ruto Vo"), and a scope that usually starts with the company ("SDGE - 300000796946 to remove 35'
 * wood pole"). Who dug is read from the company named in either; the holder's own name is never
 * kept. SDG&E runs gas and electric: a permit says which most of the time, and when it doesn't,
 * it's filed as electric, its more common work, and marked as assumed. See docs/regions/sd.md.
 */

export interface SdWork {
  utility: UtilityKind;
  owner: string;
  /** SDG&E didn't say gas or electric, so electric was assumed. */
  assumed: boolean;
}

const SDGE = /\bSDG\s?&?\s?E\b|san diego gas/i;

const COMPANIES: [RegExp, string, UtilityKind][] = [
  [/\bAT\s?&\s?T\b|\bATT\b|pacific bell|\bpac\.? bell/i, 'AT&T', 'telecom'],
  [/\bcox\b/i, 'Cox', 'telecom'],
  [/\bcharter\b|\bspectrum\b|time warner/i, 'Spectrum', 'telecom'],
  [/\bverizon\b|\bMCI\b/i, 'Verizon', 'telecom'],
  [
    /crown castle|\bzayo\b|\blumen\b|level 3|centurylink|extenet|mobilit[iy]e|wyyerd|boldyn|sunesys|\bT-?Mobile\b/i,
    'Telecom provider',
    'telecom',
  ],
];

// Private connections: the city's own pipe work doesn't need these permits, but a trench to a
// building's water, sewer or gas service does. Driveways, sidewalks and potholing match none.
const WATER =
  /\bwater (service|lateral|line|main|meter)|fire service|fire\/water|domestic (water|service)/i;
const SEWER = /\bsewer (lateral|connection|line|main|cleanout)|\blateral\b.*\bsewer/i;
const GAS_SERVICE = /\bgas (service|line|main|meter)/i;

/** Each utility a permit dug for; none for street work that isn't a utility's. */
export const classifySdPermit = (
  holder: string | null | undefined,
  title: string | null | undefined,
  scope: string | null | undefined,
  type: string | null | undefined,
): SdWork[] => {
  const named = `${holder ?? ''} ${title ?? ''} ${scope ?? ''}`;
  const work = `${title ?? ''} ${scope ?? ''}`;
  // SDG&E's program to bury overhead lines, often filed by its contractors.
  if (type === 'Elec. Utility Undergrnd. Prgm')
    return [{ utility: 'electric', owner: 'SDG&E', assumed: false }];
  // The holder is read only for a trade ("... Electric"); a person's name has none and isn't kept.
  if (SDGE.test(named))
    return energyWork(work, { holder: holder ?? '', fallback: 'electric' }).map((item) => ({
      ...item,
      owner: 'SDG&E',
    }));
  const company = COMPANIES.find(([pattern]) => pattern.test(named));
  if (company) return [{ utility: company[2], owner: company[1], assumed: false }];
  if (SEWER.test(work)) return [{ utility: 'sewer', owner: 'Other permit holder', assumed: false }];
  if (WATER.test(work)) return [{ utility: 'water', owner: 'Other permit holder', assumed: false }];
  if (GAS_SERVICE.test(work))
    return [{ utility: 'gas', owner: 'Other permit holder', assumed: false }];
  return [];
};
