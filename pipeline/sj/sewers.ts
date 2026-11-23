import { stormDrainCover } from '../sd/drains';

/**
 * San Jose's sanitary and storm gravity mains: the material's words and the depth from the
 * structures at each end. Each pipe names the manhole, cleanout or inlet upstream and downstream
 * by its facility id (UPID, DOWNID), and those layers file the lid's elevation there.
 */

// The city's material codes. A code not here is shown as written; UNK and OTH say nothing.
const MATERIALS: Record<string, string> = {
  VCP: 'Vitrified clay',
  RCP: 'Reinforced concrete',
  C: 'Concrete',
  CP: 'Concrete',
  CIP: 'Cast in place concrete',
  DIP: 'Ductile iron',
  DI: 'Ductile iron',
  CI: 'Cast iron',
  PVC: 'PVC',
  HDPE: 'Plastic (HDPE)',
  PE: 'Polyethylene',
  PEP: 'Polyethylene',
  ABS: 'ABS plastic',
  AC: 'Asbestos cement',
  BR: 'Brick',
  CM: 'Corrugated metal',
  CMP: 'Corrugated metal',
  RPM: 'Reinforced plastic mortar',
  MTL: 'Metal',
};

/** "VCP" to "Vitrified clay"; null when it isn't recorded. */
export const sjMaterial = (code: string | null | undefined): string | null => {
  const trimmed = code?.trim().toUpperCase();
  if (!trimmed || trimmed === 'UNK' || trimmed === 'OTH') return null;
  return MATERIALS[trimmed] ?? trimmed;
};

/** The street's height at each structure, by its facility id, for the pipes that meet it. */
export type Rims = Map<string, number>;

// Zero is how these layers leave an elevation blank. Alviso sits a little below sea level and
// the eastern foothills reach about 1,500 ft; past that it's a typing slip.
const isElevation = (value: number | null | undefined): value is number =>
  value != null && value !== 0 && value > -30 && value < 2000;

/** The lid's surveyed elevation where there is one, else the terrain model's ground. */
export const sjGround = (rim: number | null | undefined, dem: number | null | undefined) =>
  isElevation(rim) ? rim : isElevation(dem) ? dem : null;

export const addRim = (rims: Rims, id: string | null | undefined, ground: number | null) => {
  if (id?.trim() && ground !== null) rims.set(id.trim(), ground);
};

/** The structures a network's pipes end at, each kind numbered on its own. */
export interface NetworkRims {
  manholes: Rims;
  inlets?: Rims;
}

/**
 * The lid height at one end of a pipe, from the layer of the kind the pipe says it ends at
 * ("ssManhole", "swInlet"). Manholes, inlets and cleanouts are numbered apart, so an id read in
 * the wrong layer is another structure: an inlet's 200 ft once stood in for a manhole's 80.
 * Cleanouts, fittings and pump stations aren't published with a lid height.
 */
export const endRim = (
  network: NetworkRims,
  type: string | null | undefined,
  id: string | null | undefined,
): number | undefined => {
  const key = id?.trim();
  if (!key) return undefined;
  if (/manhole|mahole/i.test(type ?? '')) return network.manholes.get(key);
  if (/inlet/i.test(type ?? '')) return network.inlets?.get(key);
  return undefined;
};

/**
 * Cover over a pipe: at each end, the ground at the structure less the invert, averaged, less the
 * pipe's own height. Null when neither end has both, or the answer can't be real.
 */
export const sjPipeCover = (
  network: NetworkRims,
  ends: [
    type: string | null | undefined,
    id: string | null | undefined,
    invert: number | null | undefined,
  ][],
  sizeIn: number | null,
): number | null =>
  stormDrainCover(
    ends.map(([type, id, invert]) => [
      endRim(network, type, id),
      isElevation(invert) ? invert : null,
    ]),
    sizeIn,
  );

// Past 12 ft it's a flood channel or a mistyped size, as in San Diego.
const MAX_SIZE_IN = 144;

/** Inches across, or null when it isn't recorded or can't be real. */
export const sjPipeSize = (diameter: number | null | undefined): number | null =>
  diameter && diameter > 0 && diameter <= MAX_SIZE_IN ? diameter : null;
