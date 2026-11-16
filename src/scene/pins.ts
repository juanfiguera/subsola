import type { AssetKind } from '../sources/assets';

export type PinKind = AssetKind | 'work';

// 16 by 16 line glyphs, drawn inside the pin's circle.
export const GLYPHS: Record<PinKind, string> = {
  work: '<path d="M8 2.5 4.6 13h6.8L8 2.5ZM5.9 9h4.2M3 13.5h10"/>',
  hydrant: '<path d="M5 14V6a3 3 0 0 1 6 0v8M3.5 14h9M3 9h2M11 9h2M6.5 2.5h3"/>',
  'catch-basin':
    '<rect x="2.5" y="3.5" width="11" height="9" rx="1.5"/><path d="M6 3.5v9M10 3.5v9"/>',
  linknyc:
    '<path d="M2.5 7.2a8 8 0 0 1 11 0M4.8 9.6a4.6 4.6 0 0 1 6.4 0"/><circle cx="8" cy="12.2" r="1" fill="currentColor"/>',
  manhole: '<circle cx="8" cy="8" r="5.5"/><path d="M4.5 6.5h7M4.5 9.5h7"/>',
  'street-lamp': '<path d="M6 14V3.5h5v2M9.5 5.5h3"/>',
  outfall:
    '<path d="M2.5 5.5h6a3 3 0 0 1 3 3v1"/><path d="M11.5 12c0 1 .7 1.8 1.5 1.8"/><path d="M2.5 8.5h5"/><path d="M9.5 12.5c0 .9-.6 1.5-1.2 1.5"/>',
  // A vault lid with a bolt of current through it.
  'electric-structure':
    '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M8.8 4.5 6.2 8.4h3.6L7.2 11.5"/>',
  'traffic-signal':
    '<rect x="5" y="1.5" width="6" height="13" rx="2"/><circle cx="8" cy="4.6" r="1" fill="currentColor"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="8" cy="11.4" r="1" fill="currentColor"/>',
};

export const PIN_WIDTH = 64;
export const PIN_HEIGHT = 80;

/**
 * A map pin like a dropped marker: a disc, a rim that lifts it off the ground, and a point at the
 * bottom that touches the stem. With `ring`, the rim's inner part takes that color: a feature
 * on a utility's network (see assetStyle.ts).
 */
export const pinIcon = (
  kind: PinKind,
  fill: string,
  glyph: string,
  rim = '#fff',
  ring: string | null = null,
) => {
  const disc = ring
    ? `<circle cx="16" cy="16" r="14.75" fill="${rim}"/>
    <circle cx="16" cy="16" r="12.4" fill="${fill}" stroke="${ring}" stroke-width="3.2"/>`
    : `<circle cx="16" cy="16" r="13.5" fill="${fill}" stroke="${rim}" stroke-width="2.5"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_WIDTH}" height="${PIN_HEIGHT}" viewBox="0 0 32 40">
    <path d="M10.5 28 16 38.5 21.5 28Z" fill="${ring ? rim : fill}"/>
    <path d="M12.2 28 16 35.6 19.8 28Z" fill="${fill}"/>
    ${disc}
    <g transform="translate(8 8)" fill="none" stroke="${glyph}" color="${glyph}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[kind]}</g>
  </svg>`;
  return {
    id: `${kind}-${fill}-${glyph}-${rim}-${ring ?? ''}`,
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width: PIN_WIDTH,
    height: PIN_HEIGHT,
    anchorY: PIN_HEIGHT,
  };
};
