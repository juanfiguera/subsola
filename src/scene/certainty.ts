import type { SurveyedMain } from '../sources/mains';

/**
 * How sure the map is of a line, which each line's card states. Every line is drawn solid: dashes
 * were tried and read as clutter, so the card and the "est." on depth labels say it instead.
 *
 * Measured: the owner's own map puts the line on its route, and its records give its depth there.
 * Estimated: everything else. Lines placed from excavation permits, carried on from nearby blocks
 * or joined at corners; service lines drawn straight to the lot; and mapped routes whose depth is
 * the standard's, not a record's. Analytics' `depthBasis` draws the same line.
 */
export type Certainty = 'measured' | 'estimated';

export const lineCertainty = (line: { surveyed?: SurveyedMain }): Certainty =>
  line.surveyed && line.surveyed.depthFt !== null ? 'measured' : 'estimated';

/** What the line key and the explainer call each. */
export const CERTAINTY_LABELS: Record<Certainty, { short: string; detail: string }> = {
  measured: {
    short: 'Mapped and measured',
    detail: "On the owner's mapped route, at the depth its records give.",
  },
  estimated: {
    short: 'Estimated',
    detail: 'Placed from permits or inferred, at the depth standards require.',
  },
};
