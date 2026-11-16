import type { Region } from '../regions';
import { RECYCLED_WATER, UTILITY_STYLES, type UtilityKind } from '../utilities';
import { CERTAINTY_LABELS } from '../scene/certainty';
import { escapeHtml } from './dom';
import { GLYPHS, pinIcon, type PinKind } from '../scene/pins';

/**
 * "What you're looking at", behind the ? button: what each color, line style, label and pin
 * means, and that this is evidence from public records, not a locate. It grew out of the
 * first-visit guide that used to sit at the top of the home card (subsola:guide-seen), with the
 * parts that card couldn't fit: solid against dashed, street features, service markers and
 * active work.
 */

export interface ExplainerInput {
  region: Region;
  /** The utilities on this street, in layer order; the five main ones when nothing has loaded. */
  utilities: UtilityKind[];
  /** San Diego's purple pipe is on this street. */
  recycled: boolean;
  /** The current depth stretch, as in "6×". */
  stretch: number;
}

export const DEFAULT_UTILITIES: UtilityKind[] = ['electric', 'gas', 'telecom', 'water', 'sewer'];

// What each utility carries, in a few words, so a swatch isn't only a name.
const CARRIES: Partial<Record<UtilityKind, string>> = {
  electric: 'power cables',
  gas: 'gas mains',
  telecom: 'phone, cable and fiber',
  water: 'drinking water',
  sewer: 'sewage and storm runoff',
  steam: 'district steam',
};

const swatch = (color: string) =>
  `<span class="explainer-swatch" style="--accent:${color}" aria-hidden="true"></span>`;

// A street feature pin as the map draws it, colored by the page's tokens so it follows the theme.
const featurePin = (kind: PinKind, ring: string | null) =>
  `<svg class="explainer-pin" viewBox="0 0 32 40" aria-hidden="true"${ring ? ` style="--ring:${ring}"` : ''}>
    <path class="pin-tail" d="M11 28 16 37.5 21 28Z"/>
    <circle class="pin-halo" cx="16" cy="16" r="14.75"/>
    <circle class="pin-disc${ring ? ' is-ringed' : ''}" cx="16" cy="16" r="${ring ? 12.4 : 13}"/>
    <g class="pin-glyph" transform="translate(8 8)">${GLYPHS[kind]}</g>
  </svg>`;

const workPin = () =>
  `<img class="explainer-pin" src="${pinIcon('work', '#ffffff', '#1b2230', '#1b2230').url}" alt="" />`;

const marker = (kind: 'lead' | 'not-lead' | 'unknown') =>
  `<span class="explainer-marker is-${kind}" aria-hidden="true"></span>`;

export const explainerHtml = ({ region, utilities, recycled, stretch }: ExplainerInput) => {
  const shown = utilities.length ? utilities : DEFAULT_UTILITIES;
  const colors = shown
    .filter((utility) => utility !== 'capital')
    .map(
      (utility) =>
        `<li>${swatch(UTILITY_STYLES[utility].color)}<strong>${UTILITY_STYLES[utility].label}</strong><span>${CARRIES[utility] ?? ''}</span></li>`,
    )
    .concat(
      recycled
        ? [
            `<li>${swatch(RECYCLED_WATER.color)}<strong>${RECYCLED_WATER.label}</strong><span>treated water for irrigation, not for drinking</span></li>`,
          ]
        : [],
    )
    .join('');
  return `
    <header class="explainer-head">
      <h2 id="explainer-title">What you're looking at</h2>
      <button class="explainer-close" data-action="close-explainer" aria-label="Close">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>
      </button>
    </header>
    <div class="explainer-body">
      <section>
        <h3>Colors are utilities</h3>
        <p>The colors crews paint on the pavement before a dig (the APWA code). On the map these colors only ever mean a utility line, and every line has a label too.</p>
        <ul class="explainer-colors">${colors}</ul>
      </section>
      <section>
        <h3>How exact the lines are</h3>
        <p><strong>${escapeHtml(CERTAINTY_LABELS.measured.short)}.</strong> ${escapeHtml(CERTAINTY_LABELS.measured.detail)}</p>
        <p><strong>${escapeHtml(CERTAINTY_LABELS.estimated.short)}.</strong> ${escapeHtml(CERTAINTY_LABELS.estimated.detail)} Most lines are estimated: utilities rarely publish where their pipes are. Tap a line and its card says which it is.</p>
      </section>
      <section>
        <h3>Depth labels</h3>
        <p><span class="explainer-tag">Water, est. 3 ft 5 in</span> is the depth to the top of the pipe. <em>est.</em> means it's the depth a code or standard requires, not one measured there; a label without it gives the owner's recorded depth. <em>Depth unknown</em> means no standard is published, so treat the line as possible anywhere in the top few feet.</p>
        <p>Depth is stretched ${stretch}× so the layers don't sit on top of each other. Labels always give real feet.</p>
      </section>
      <section>
        <h3>Pins and markers</h3>
        <ul class="explainer-pins">
          <li>${featurePin('street-lamp', null)}<span><strong>Gray pins</strong> are street features: lamps, signals, kiosks. They're off at first; turn them on in the layer list.</span></li>
          <li>${featurePin('hydrant', UTILITY_STYLES.water.color)}<span><strong>A colored ring</strong> means the feature is part of that utility's network, like a hydrant on the water main.</span></li>
          <li><span class="explainer-markers">${marker('lead')}${marker('not-lead')}${marker('unknown')}</span><span><strong>Dots where a service line meets a lot</strong>: dark for lead or galvanized pipe, blue for not lead, hollow when the city doesn't know yet.</span></li>
          <li>${workPin()}<span><strong>Active work</strong>: a street opening permitted for today, banded in white on its block.</span></li>
        </ul>
      </section>
      <section class="explainer-notice">
        <h3>Evidence, not a locate</h3>
        <p>Everything here comes from public records: excavation permits, city and utility maps, and lot inventories. It shows what the records say, not what a locator would find. Private lines never appear.</p>
        <p>${escapeHtml(region.markout.law)} requires a free request to ${escapeHtml(region.markout.center)} at least ${escapeHtml(region.markout.notice)} before any digging.</p>
        <a class="call-811" href="${escapeHtml(region.markout.url)}" target="_blank" rel="noopener">Call 811 before digging</a>
      </section>
    </div>`;
};
