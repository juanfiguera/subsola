import { RECYCLED_WATER, UTILITY_STYLES, inkOn, type UtilityKind } from '../utilities';

export type Rgba = [number, number, number, number];

export const INK: Rgba = [27, 34, 48, 255];
export const WHITE: Rgba = [255, 255, 255, 255];
export const FONT = 'Barlow, system-ui, sans-serif';

const NEUTRAL_HEX = '#7c8796';

const hexToRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const hexOf = (utility: UtilityKind | null) =>
  utility ? UTILITY_STYLES[utility].color : NEUTRAL_HEX;

export const colorOf = (utility: UtilityKind | null, alpha = 255): Rgba => [
  ...hexToRgb(hexOf(utility)),
  alpha,
];

/** A darker edge in the utility's own hue, so even gas yellow holds a crisp line on a light ground. */
export const edgeOf = (utility: UtilityKind | null, alpha = 255): Rgba => {
  const [r, g, b] = hexToRgb(hexOf(utility));
  return [r * 0.6, g * 0.6, b * 0.6, alpha];
};

/** The utility color mixed toward white by `amount` (0 to 1), for fittings and glass. */
export const tintOf = (utility: UtilityKind | null, amount: number, alpha = 255): Rgba => {
  const [r, g, b] = hexToRgb(hexOf(utility));
  const mix = (c: number) => c + (255 - c) * amount;
  return [mix(r), mix(g), mix(b), alpha];
};

export const inkRgb = (utility: UtilityKind | null): Rgba => [
  ...hexToRgb(inkOn(hexOf(utility))),
  255,
];

/** A pipe or fitting: its utility, and whether it's San Diego's purple pipe. */
export interface PipeColored {
  utility: UtilityKind;
  recycled?: true;
}

const pipeHexOf = (pipe: PipeColored) =>
  pipe.recycled ? RECYCLED_WATER.color : hexOf(pipe.utility);

/** A pipe's own color: its utility's, or APWA purple for recycled water. */
export const pipeColorOf = (pipe: PipeColored, alpha = 255): Rgba => [
  ...hexToRgb(pipeHexOf(pipe)),
  alpha,
];

/** A pipe's own color mixed toward white, for its fittings. */
export const pipeTintOf = (pipe: PipeColored, amount: number, alpha = 255): Rgba => {
  const [r, g, b] = hexToRgb(pipeHexOf(pipe));
  const mix = (c: number) => c + (255 - c) * amount;
  return [mix(r), mix(g), mix(b), alpha];
};

/** A darker edge in the pipe's own hue, for its label. */
export const pipeEdgeOf = (pipe: PipeColored): Rgba => {
  const [r, g, b] = hexToRgb(pipeHexOf(pipe));
  return [r * 0.6, g * 0.6, b * 0.6, 255];
};
