import { plausibleDepth } from '../depth';

/**
 * San Diego's storm drains as SanGIS publishes them (`Drain_Conveyance`): the size, the
 * material's words, and the depth from the rims of the inlets and cleanouts at their ends.
 */

// The city's material codes. A code not here is shown as written.
const MATERIALS: Record<string, string> = {
  RCP: 'Reinforced concrete',
  RC: 'Reinforced concrete',
  CONC: 'Concrete',
  CIPCP: 'Cast in place concrete',
  ACP: 'Asbestos cement',
  PVCP: 'PVC',
  PVC: 'PVC',
  PPVCP: 'Perforated PVC',
  HDPE: 'Plastic (HDPE)',
  PEP: 'Polyethylene',
  CPEP: 'Corrugated polyethylene',
  ABS: 'ABS plastic',
  CMP: 'Corrugated metal',
  CSP: 'Corrugated steel',
  CAP: 'Corrugated aluminum',
  STEEL: 'Steel',
  VCP: 'Vitrified clay',
};

/** "RCP" to "Reinforced concrete"; a box culvert (X) says so. Null when it isn't recorded. */
export const stormDrainMaterial = (
  code: string | null | undefined,
  type: string | null | undefined,
): string | null => {
  const trimmed = code?.trim().toUpperCase();
  const words = trimmed && trimmed !== 'UNK' ? (MATERIALS[trimmed] ?? trimmed) : null;
  if (type !== 'X') return words;
  return words ? `${words} box` : 'Box culvert';
};

// Past 12 ft it's a flood channel's culvert or a mistyped size; drawn that big it would
// swallow the street, so the size is left blank.
const MAX_SIZE_IN = 144;

/** Inches across, or tall for a box culvert, which records a width and height instead. */
export const stormDrainSizeIn = (
  diameter: number | null | undefined,
  height: number | null | undefined,
): number | null => {
  const size = diameter && diameter > 0 ? diameter : height && height > 0 ? height : null;
  return size !== null && size <= MAX_SIZE_IN ? size : null;
};

/** A pipe end's place, to meet the structure the city drew it to: the same point, to 10 cm. */
export const endKey = ([x, y]: number[]) => `${x!.toFixed(6)},${y!.toFixed(6)}`;

/**
 * Cover over a storm drain: the average at its two ends of the rim less the invert, less the
 * pipe's own height. An end with no rim, or zero for an invert (how the layer leaves one blank),
 * is skipped.
 */
export const stormDrainCover = (
  ends: [rim: number | undefined, invert: number | null | undefined][],
  sizeIn: number | null,
): number | null => {
  const depths = ends.flatMap(([rim, invert]) =>
    rim !== undefined && invert != null && invert !== 0 && rim > invert ? [rim - invert] : [],
  );
  if (!depths.length) return null;
  const average = depths.reduce((sum, depth) => sum + depth, 0) / depths.length;
  return plausibleDepth(average - (sizeIn ?? 18) / 12);
};
