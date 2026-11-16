import type { Vec2 } from '../../src/scene/local';
import {
  RECYCLED_WATER,
  UTILITY_KINDS,
  UTILITY_STYLES,
  type UtilityKind,
} from '../../src/utilities';

/**
 * The link preview for a shared street: a plan of the block with each utility line where the map
 * places it, in the locator paint colors, beside the address. An SVG string, turned into a PNG by
 * resvg in the Pages Function. Pure, so it's tested without the renderer.
 */

export const WIDTH = 1200;
export const HEIGHT = 630;

export interface PlanLine {
  utility: UtilityKind;
  /** Local meters, east and north of the shared spot. */
  path: Vec2[];
  /** Carried through a block with no record for it; drawn dashed, as the map does. */
  assumed: boolean;
  recycled: boolean;
}

export interface StreetPlan {
  lines: PlanLine[];
  /** Street centerlines, to show where the roads run in cities with no roadbed outlines. */
  streets: Vec2[][];
  curbs: Vec2[][];
  /** Outer rings of building footprints. */
  buildings: Vec2[][];
}

export interface PreviewText {
  /** "117 West St". */
  street: string;
  /** "New York City". */
  city: string;
  beta: boolean;
}

const INK = '#1b2230';
const INK_2 = '#4f5a6d';
const INK_3 = '#5f697c';
const GROUND = '#eceef1';
const HIVIS = '#ffd60a';
/** The site's mark: a strip of locator paint. */
const MARK_COLORS = (['electric', 'gas', 'telecom', 'water', 'sewer'] as const).map(
  (kind) => UTILITY_STYLES[kind].color,
);

const PANEL_W = 480;
const MAP_X = PANEL_W;
const MAP_W = WIDTH - PANEL_W;
/** Meters across the map, about a block and its two corners. */
export const VIEW_M = 160;
const SCALE = MAP_W / VIEW_M;
const STREET_WIDTH_M = 13;

/** Every string drawn goes through this; the street name came in on a URL. */
export const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const toPx = ([x, y]: Vec2): Vec2 => [MAP_X + MAP_W / 2 + x * SCALE, HEIGHT / 2 - y * SCALE];

const pathData = (points: Vec2[], close = false) =>
  points.length < 2
    ? ''
    : points
        .map((point, i) => {
          const [x, y] = toPx(point);
          return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join('') + (close ? 'Z' : '');

/** Half the map's width and height, in meters. */
const HALF_X = VIEW_M / 2;
const HALF_Y = HEIGHT / SCALE / 2;

/** Whether the segment a-b crosses the box of half-sizes hx, hy around the spot (Liang-Barsky). */
const segmentInBox = ([ax, ay]: Vec2, [bx, by]: Vec2, hx: number, hy: number) => {
  let low = 0;
  let high = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, q] of [
    [-dx, ax + hx],
    [dx, hx - ax],
    [-dy, ay + hy],
    [dy, hy - ay],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) low = Math.max(low, t);
    else high = Math.min(high, t);
    if (low > high) return false;
  }
  return true;
};

/** Whether any part of a line shows inside the box, `margin` meters past the map's edges. */
export const inView = (points: Vec2[], margin = 0) =>
  points.length === 1
    ? Math.abs(points[0]![0]) <= HALF_X + margin && Math.abs(points[0]![1]) <= HALF_Y + margin
    : points
        .slice(1)
        .some((point, i) => segmentInBox(points[i]!, point, HALF_X + margin, HALF_Y + margin));

// Geometry this far past the edges is still drawn, so a casing or a street end isn't cut short.
const EDGE_M = 15;
const nearView = (points: Vec2[]) => inView(points, EDGE_M);

/** For outlines: a building can cover the whole map with every edge outside it. */
const boxNearView = (ring: Vec2[]) => {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  return (
    Math.min(...xs) < HALF_X + EDGE_M &&
    Math.max(...xs) > -HALF_X - EDGE_M &&
    Math.min(...ys) < HALF_Y + EDGE_M &&
    Math.max(...ys) > -HALF_Y - EDGE_M
  );
};

const colorOf = (line: PlanLine) =>
  line.recycled ? RECYCLED_WATER.color : UTILITY_STYLES[line.utility].color;

/**
 * Words into lines of at most `max` characters. Barlow Condensed is narrow enough that a count
 * of characters is a fair stand-in for width at these sizes.
 */
export const wrapWords = (text: string, max: number): string[] => {
  const lines: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= max)
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
};

/** The address in the largest size that fits in two lines, cut short with an ellipsis if not. */
export const fitStreet = (street: string): { size: number; lines: string[] } => {
  const sizes = [
    [72, 11],
    [60, 14],
    [50, 17],
    [42, 20],
  ] as const;
  for (const [size, max] of sizes) {
    const lines = wrapWords(street, max);
    if (lines.length <= 2 && lines.every((line) => line.length <= max)) return { size, lines };
  }
  const [first = '', second = ''] = wrapWords(street, 20);
  return { size: 42, lines: [first.slice(0, 20), `${second.slice(0, 19)}\u2026`] };
};

/** The utilities on the plan, in the layer list's order, with recycled water apart from water. */
export const legendOf = (lines: PlanLine[]) => {
  const keys = new Set(
    lines
      .filter((line) => inView(line.path))
      .map((line) => (line.recycled ? 'recycled' : line.utility)),
  );
  return [
    ...UTILITY_KINDS.filter((kind) => keys.has(kind)).map((kind) => UTILITY_STYLES[kind]),
    ...(keys.has('recycled') ? [RECYCLED_WATER] : []),
  ];
};

const mapLayer = (plan: StreetPlan) => {
  const streets = plan.streets
    .filter(nearView)
    .map((line) => `<path d="${pathData(line)}"/>`)
    .join('');
  const buildings = plan.buildings
    .filter(boxNearView)
    .map((ring) => `<path d="${pathData(ring, true)}"/>`)
    .join('');
  const curbs = plan.curbs
    .filter(nearView)
    .map((line) => `<path d="${pathData(line)}"/>`)
    .join('');
  const lines = plan.lines.filter((line) => nearView(line.path) && line.path.length > 1);
  // A white casing under every line first, so crossing lines stay readable.
  const casings = lines.map((line) => `<path d="${pathData(line.path)}"/>`).join('');
  const colored = lines
    .map(
      (line) =>
        `<path d="${pathData(line.path)}" stroke="${colorOf(line)}"${line.assumed ? ' stroke-dasharray="12 9"' : ''}/>`,
    )
    .join('');
  const [cx, cy] = toPx([0, 0]);
  return `<g clip-path="url(#map)">
    <rect x="${MAP_X}" y="0" width="${MAP_W}" height="${HEIGHT}" fill="${GROUND}"/>
    <g fill="none" stroke="#ffffff" stroke-width="${(STREET_WIDTH_M * SCALE).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round">${streets}</g>
    <g fill="#dde1e7" stroke="#c9cfd8" stroke-width="1.5" stroke-linejoin="round">${buildings}</g>
    <g fill="none" stroke="#b9c0cb" stroke-width="2" stroke-linecap="round">${curbs}</g>
    <g fill="none" stroke="#ffffff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">${casings}</g>
    <g fill="none" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${colored}</g>
    <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9" fill="${INK}" stroke="#ffffff" stroke-width="4"/>
  </g>`;
};

const legendLayer = (plan: StreetPlan, top: number) => {
  const items = legendOf(plan.lines);
  if (!items.length)
    return `<text x="56" y="${top + 24}" font-size="24" fill="${INK_2}">No utility records on this block yet</text>`;
  // Two columns once there are more than four.
  const perColumn = items.length > 4 ? Math.ceil(items.length / 2) : items.length;
  return items
    .map((item, i) => {
      const x = 56 + Math.floor(i / perColumn) * 190;
      const y = top + (i % perColumn) * 40;
      return `<rect x="${x}" y="${y + 8}" width="30" height="10" rx="5" fill="${item.color}"/><text x="${x + 42}" y="${y + 21}" font-size="25" fill="${INK}">${escapeXml(item.label)}</text>`;
    })
    .join('');
};

export const streetPreviewSvg = (text: PreviewText, plan: StreetPlan): string => {
  const { size, lines } = fitStreet(text.street);
  const streetTop = 150;
  const lineHeight = Math.round(size * 0.98);
  const streetText = lines
    .map(
      (line, i) =>
        `<text x="56" y="${streetTop + size * 0.8 + i * lineHeight}" font-family="Barlow Condensed" font-weight="800" font-size="${size}" fill="${INK}">${escapeXml(line)}</text>`,
    )
    .join('');
  const cityY = streetTop + size * 0.8 + (lines.length - 1) * lineHeight + 46;
  const beta = text.beta
    ? `<rect x="${56 + text.city.length * 14.5 + 14}" y="${cityY - 22}" width="62" height="28" rx="6" fill="${INK}"/><text x="${56 + text.city.length * 14.5 + 45}" y="${cityY - 1}" font-size="16" fill="#ffffff" text-anchor="middle" letter-spacing="1">BETA</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="Barlow" font-weight="600">
  <defs>
    <clipPath id="map"><rect x="${MAP_X}" y="0" width="${MAP_W}" height="${HEIGHT}"/></clipPath>
    <clipPath id="mark"><rect x="56" y="58" width="36" height="36" rx="9"/></clipPath>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>
  ${mapLayer(plan)}
  <rect x="${PANEL_W - 1}" y="0" width="1" height="${HEIGHT}" fill="#d5dae1"/>
  <g clip-path="url(#mark)">${MARK_COLORS.map(
    (color, i) => `<rect x="${56 + i * 7.2}" y="58" width="7.2" height="36" fill="${color}"/>`,
  ).join('')}</g>
  <text x="106" y="88" font-family="Barlow Condensed" font-weight="800" font-size="40" fill="${INK}">Subsola</text>
  ${streetText}
  <text x="56" y="${cityY}" font-size="28" fill="${INK_2}">${escapeXml(text.city)}</text>
  ${beta}
  ${legendLayer(plan, cityY + 34)}
  <rect x="56" y="${HEIGHT - 86}" width="5" height="50" fill="${HIVIS}"/>
  <text x="76" y="${HEIGHT - 66}" font-size="19" fill="${INK_3}">Research, not a utility locate.</text>
  <text x="76" y="${HEIGHT - 42}" font-size="19" fill="${INK_3}">Call 811 before you dig.</text>
  <rect x="${WIDTH - 326}" y="${HEIGHT - 52}" width="306" height="34" rx="8" fill="#ffffff" fill-opacity="0.92"/>
  <text x="${WIDTH - 173}" y="${HEIGHT - 29}" font-size="17" fill="${INK_3}" text-anchor="middle">Lines as placed from public records</text>
</svg>`;
};
