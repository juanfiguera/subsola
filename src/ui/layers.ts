import type { AssetKind } from '../sources/assets';
import type { UtilityKind } from '../utilities';
import { escapeHtml } from './dom';

export type LayerKey =
  | UtilityKind
  | AssetKind
  | 'work'
  | 'services'
  | 'house-sewers'
  | 'recycled'
  | 'dig-spots'
  | 'flow';

export interface LayerRow {
  key: LayerKey;
  label: string;
  color: string;
  /** Short right-aligned note, like a count. */
  detail?: string;
  /** A line under the name saying what the count means, for counts that could be misread. */
  note?: string;
  /** The row explained in a sentence, on hover and to screen readers. */
  detailTitle?: string;
  /** A street feature: drawn in the neutral feature color, with this utility ring if any. */
  feature?: { ring: string | null };
}

const row = (layer: LayerRow, hidden: Set<LayerKey>) => {
  const on = !hidden.has(layer.key);
  const style = layer.feature
    ? `--accent:var(--feature)${layer.feature.ring ? `;--ring:${layer.feature.ring}` : ''}`
    : `--accent:${layer.color}`;
  const swatch = layer.feature
    ? `layer-swatch is-feature${layer.feature.ring ? ' is-ringed' : ''}`
    : 'layer-swatch';
  return `
    <li>
      <button class="layer" role="switch" aria-checked="${on}" data-layer="${layer.key}" style="${style}"${layer.detailTitle ? ` title="${escapeHtml(layer.detailTitle)}"` : ''}>
        <span class="${swatch}" aria-hidden="true"></span>
        <span class="layer-name">${escapeHtml(layer.label)}${layer.note ? `<span class="layer-note">${escapeHtml(layer.note)}</span>` : ''}</span>
        ${layer.detail ? `<span class="layer-detail">${escapeHtml(layer.detail)}</span>` : ''}
        <span class="switch" aria-hidden="true"></span>
      </button>
    </li>`;
};

const section = (title: string, rows: LayerRow[], hidden: Set<LayerKey>) =>
  rows.length
    ? `<h2 class="layers-title">${title}</h2><ul class="layer-list">${rows.map((r) => row(r, hidden)).join('')}</ul>`
    : '';

export const layersPanel = (
  underground: LayerRow[],
  onStreet: LayerRow[],
  hidden: Set<LayerKey>,
  loading: boolean,
) =>
  loading && !underground.length
    ? '<h2 class="layers-title">Under the street</h2><div class="chip-skeleton"></div><div class="chip-skeleton"></div><div class="chip-skeleton"></div>'
    : section('Under the street', underground, hidden) +
      section('On the street', onStreet, hidden);
