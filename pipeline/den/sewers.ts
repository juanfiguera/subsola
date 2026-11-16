import { stormDrainCover } from '../sd/drains';

/**
 * Denver Wastewater Management's sanitary and storm mains: the material's words, the owner when
 * it isn't the city, and the depth from the manholes at each end. Each pipe names its upstream
 * and downstream node ("24439SAMH"), and the manhole layer files the ground elevation there.
 */

// The city's material codes. A code not here is shown as written; XXX is unknown.
const MATERIALS: Record<string, string> = {
  VCP: 'Vitrified clay',
  PVC: 'PVC',
  RCP: 'Reinforced concrete',
  CP: 'Concrete',
  CIP: 'Cast iron',
  DIP: 'Ductile iron',
  BR: 'Brick',
  ABS: 'ABS plastic',
  CIPP: 'Cured in place liner',
  HDPE: 'Plastic (HDPE)',
  PP: 'Polypropylene',
  FRP: 'Fiberglass',
  SP: 'Steel',
  CMP: 'Corrugated metal',
  OTHRP: 'Other plastic',
};

/** "VCP" to "Vitrified clay"; null when it isn't recorded. */
export const denMaterial = (code: string | null | undefined): string | null => {
  const trimmed = code?.trim().toUpperCase();
  if (!trimmed || trimmed === 'XXX' || trimmed === 'UNKN') return null;
  return MATERIALS[trimmed] ?? trimmed;
};

// Owners other than the city, in their own names. Denver's own codes (DPUB and the agency codes)
// are left blank, since the city is who maps them.
const OWNERS: Record<string, string> = {
  MWRD: 'Metro Water Recovery',
  CDOT: 'Colorado Department of Transportation',
  FDST: 'Federal or state government',
  NDPUB: 'Another public agency',
  OCCD: 'Outside the City and County',
  RTD: 'Regional Transportation District',
  OTHR: 'Another owner',
};

export const denOwner = (code: string | null | undefined): string | null =>
  (code && OWNERS[code.trim()]) ?? null;

/** The ground at each manhole, by its node id, for the pipes that meet it. */
export type Rims = Map<string, number>;

// Some manholes record zero, or the depth's place holds the elevation; no street in Denver is
// below 5,000 ft or above 6,000.
const isElevation = (value: number | null | undefined): value is number =>
  value != null && value > 5000 && value < 6000;

export const addRim = (
  rims: Rims,
  node: string | null | undefined,
  ground: number | null | undefined,
) => {
  if (node && isElevation(ground)) rims.set(node.trim(), ground);
};

/**
 * Cover over a pipe: at each end, the ground at the manhole less the invert, averaged, less the
 * pipe's own height. An end with no manhole ground or no invert is skipped; null when neither
 * end has both, or the answer can't be real.
 */
export const denPipeCover = (
  rims: Rims,
  ends: [node: string | null | undefined, invert: number | null | undefined][],
  heightIn: number | null,
): number | null =>
  stormDrainCover(
    ends.map(([node, invert]) => [
      node ? rims.get(node.trim()) : undefined,
      isElevation(invert) ? invert : null,
    ]),
    heightIn,
  );

// Past 12 ft it's a flood channel's culvert or a mistyped size, as in San Diego.
const MAX_SIZE_IN = 144;

/** Inches across, or tall for a box or an egg-shaped pipe. */
export const denPipeSize = (
  width: number | null | undefined,
  height: number | null | undefined,
): number | null => {
  const size = height && height > 0 ? height : width && width > 0 ? width : null;
  return size !== null && size <= MAX_SIZE_IN ? size : null;
};
