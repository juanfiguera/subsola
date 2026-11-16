import type { Theme } from '../theme';
import type { Rgba } from './colors';

/**
 * Every color the 3D scene paints that isn't a utility's own, per theme. Utility hues stay the
 * APWA ones in both: each clears 3:1 on the dark ground as is (src/theme.test.ts). See
 * docs/dark-mode.md for the reasoning; the light values are the model view as it always was.
 */
export interface ScenePalette {
  theme: Theme;
  road: Rgba;
  curb: Rgba;
  building: Rgba;
  buildingEdge: Rgba;
  /** Street names painted on the road. */
  label: Rgba;
  /** From street level and below, the roadbed is a see-through ceiling so you know what's overhead. */
  roadAbove: Rgba;
  sidewalkAbove: Rgba;
  /** Selection outlines, the selected pin, lead service markers: dark on light, light on dark. */
  ink: Rgba;
  inkHex: string;
  /** Text and glyphs drawn on `ink`. */
  onInk: Rgba;
  onInkHex: string;
  /** The rim that lifts a marker off the ground: white on light, the ground on dark. */
  halo: Rgba;
  /** An unknown service line's marker is hollow: the ground shows through it. */
  hollow: Rgba;
  /** Inferred pipes mix toward this, so less certain always reads dimmer. */
  assumedToward: [number, number, number];
  /** Thin line work in a utility's hue (stems, dimension lines): darker on light, lighter on dark. */
  edgeMix: { toward: [number, number, number]; amount: number };
  streetTagText: Rgba;
  streetTagBackground: Rgba;
  addressStem: Rgba;
  /** Aerial photos are multiplied by this gray: dimmed, never tinted. */
  photoTint: [number, number, number];
  /** Street feature pins and dots: one neutral for all of them (see assetStyle.ts). */
  feature: Rgba;
  featureHex: string;
  /** The glyph on a feature pin. */
  onFeatureHex: string;
  /** A feature pin's stem. */
  featureStem: Rgba;
}

const LIGHT: ScenePalette = {
  theme: 'light',
  road: [247, 248, 250, 255],
  curb: [182, 190, 202, 255],
  building: [255, 255, 255, 255],
  buildingEdge: [196, 203, 214, 255],
  label: [128, 138, 155, 255],
  roadAbove: [27, 34, 48, 150],
  // Lighter, like concrete next to asphalt, so the curb still reads where the two slabs meet.
  sidewalkAbove: [88, 97, 112, 110],
  ink: [27, 34, 48, 255],
  inkHex: '#1b2230',
  onInk: [255, 255, 255, 255],
  onInkHex: '#ffffff',
  halo: [255, 255, 255, 255],
  hollow: [255, 255, 255, 255],
  assumedToward: [255, 255, 255],
  edgeMix: { toward: [0, 0, 0], amount: 0.4 },
  streetTagText: [255, 255, 255, 255],
  // See-through ink, like the roadbed it names, so it never reads as the address tag.
  streetTagBackground: [27, 34, 48, 190],
  addressStem: [27, 34, 48, 200],
  photoTint: [255, 255, 255],
  // A slate that holds a white glyph (5.4:1) and stays quieter than any utility hue.
  feature: [93, 104, 120, 255],
  featureHex: '#5d6878',
  onFeatureHex: '#ffffff',
  featureStem: [93, 104, 120, 170],
};

// The ground under the scene is --ground in style.css: #14181e.
const GROUND_DARK: [number, number, number] = [20, 24, 30];

const DARK: ScenePalette = {
  theme: 'dark',
  // Roads a step lighter than the ground, as on the light model and every dark street map.
  road: [28, 33, 41, 255],
  curb: [78, 87, 102, 255],
  // Lit and shaded by the scene's lights like the white massing; the lights about double it on
  // screen, to a gray a step above the road.
  building: [25, 29, 36, 255],
  buildingEdge: [72, 80, 95, 255],
  label: [124, 134, 151, 255],
  roadAbove: [96, 106, 122, 130],
  sidewalkAbove: [140, 149, 164, 110],
  ink: [231, 234, 239, 255],
  inkHex: '#e7eaef',
  onInk: [20, 24, 30, 255],
  onInkHex: '#14181e',
  halo: [20, 24, 30, 255],
  hollow: [...GROUND_DARK, 255],
  assumedToward: GROUND_DARK,
  edgeMix: { toward: [255, 255, 255], amount: 0.2 },
  streetTagText: [231, 234, 239, 255],
  streetTagBackground: [52, 60, 74, 225],
  addressStem: [231, 234, 239, 200],
  photoTint: [205, 205, 205],
  // Light on the dark ground, with a dark glyph, the way the light model reverses.
  feature: [163, 172, 185, 255],
  featureHex: '#a3acb9',
  onFeatureHex: '#14181e',
  featureStem: [163, 172, 185, 160],
};

export const scenePalette = (theme: Theme): ScenePalette => (theme === 'dark' ? DARK : LIGHT);
