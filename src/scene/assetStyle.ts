import type { AssetKind } from '../sources/assets';
import type { UtilityKind } from '../utilities';

/**
 * How a street feature is drawn. On this map a utility hue means a utility line, so no feature
 * is filled with one: every pin and dot is the same neutral gray, and its glyph says what it is.
 *
 * Features that are part of a utility's network (a hydrant on the water main, a catch basin or
 * outfall on the sewer, a manhole over its line, a Con Edison vault on the electric grid) add a
 * thin ring in that utility's color. The ring keeps the tie a crew cares about ("this hydrant is
 * on the water main") without a blue pin weighing as much as the water main itself; a ring is
 * the smallest mark that still carries a color at pin size. Street furniture that only draws
 * power or a data line from the street (lamps, signals, LinkNYC kiosks) gets no ring: tinting
 * a hundred lamps red would read as a hundred electric lines.
 */

const NETWORK_KINDS: ReadonlySet<AssetKind> = new Set<AssetKind>([
  'hydrant',
  'catch-basin',
  'manhole',
  'outfall',
  'electric-structure',
]);

/** The utility whose color rings this feature, or null for furniture and unknown manholes. */
export const networkOf = (kind: AssetKind, utility: UtilityKind | null): UtilityKind | null =>
  NETWORK_KINDS.has(kind) ? utility : null;

/** Whether a feature is street furniture rather than part of a utility network. */
export const isFurniture = (kind: AssetKind) => !NETWORK_KINDS.has(kind);
