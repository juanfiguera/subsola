import { z } from 'zod';
import { UTILITY_KINDS } from '../utilities';
import type { AssetKind } from '../sources/assets';
import type { LayerKey } from './layers';

/**
 * Which layers start on, and what each browser changed. The map opens on the pipes: the
 * utilities, their service lines and active work. Street features (hydrants, lamps, kiosks and
 * the rest) number over a thousand on a Manhattan block and buried the lines under pins, so they
 * start off, one switch away. A switch someone flips is remembered here, so their map opens the
 * way they left it; switches they never touched keep following these defaults.
 */

export const STREET_FEATURES: readonly AssetKind[] = [
  'hydrant',
  'catch-basin',
  'manhole',
  'linknyc',
  'street-lamp',
  'traffic-signal',
  'outfall',
  'electric-structure',
];

/** Off until switched on: street features, and the painted marks where crews noted a dig. */
export const DEFAULT_OFF: ReadonlySet<LayerKey> = new Set<LayerKey>([
  ...STREET_FEATURES,
  'dig-spots',
]);

const ALL_KEYS: ReadonlySet<string> = new Set<string>([
  ...UTILITY_KINDS,
  ...STREET_FEATURES,
  'work',
  'services',
  'house-sewers',
  'recycled',
  'dig-spots',
  'flow',
]);

/** Switches flipped away from their default: true for on, false for off. */
export type LayerChoices = Partial<Record<LayerKey, boolean>>;

export const STORAGE_KEY = 'subsola:layers';

const storedSchema = z.record(z.string(), z.boolean());

/** What was stored, keeping only layers this version knows. Anything unreadable is no choices. */
export const parseLayerChoices = (raw: string | null): LayerChoices => {
  if (!raw) return {};
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return {};
  }
  const parsed = storedSchema.safeParse(json);
  if (!parsed.success) return {};
  return Object.fromEntries(
    Object.entries(parsed.data).filter(([key]) => ALL_KEYS.has(key)),
  ) as LayerChoices;
};

export const isOnByDefault = (key: LayerKey) => !DEFAULT_OFF.has(key);

/** The layers to hide: the defaults, with this browser's choices on top. */
export const hiddenLayers = (choices: LayerChoices): Set<LayerKey> => {
  const hidden = new Set<LayerKey>(DEFAULT_OFF);
  for (const [key, on] of Object.entries(choices) as [LayerKey, boolean][]) {
    if (on) hidden.delete(key);
    else hidden.add(key);
  }
  return hidden;
};

/** The choices after a switch is flipped. Back at its default, it stops being a choice. */
export const withChoice = (choices: LayerChoices, key: LayerKey, on: boolean): LayerChoices => {
  const next = { ...choices };
  if (on === isOnByDefault(key)) delete next[key];
  else next[key] = on;
  return next;
};

// Storage can be blocked (private windows, strict settings); then the defaults apply each visit.
export const readLayerChoices = (): LayerChoices => {
  try {
    return parseLayerChoices(localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
};

export const saveLayerChoices = (choices: LayerChoices) => {
  try {
    if (Object.keys(choices).length) localStorage.setItem(STORAGE_KEY, JSON.stringify(choices));
    else localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[subsola] could not remember the layer switches', error);
  }
};
