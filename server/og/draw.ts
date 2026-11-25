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
  /** Carried through a block with no record for it; drawn pale, as the map does. */
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

/** What the preview says about the spot; see streetFacts in plan.ts. */
export interface StreetFacts {
  /** Permits that open the street within 500 ft. */
  permits: number;
  /** The year of the first of them. */
  since: number | null;
  /** The dig permitted today, soonest-ending first, and how many there are. */
  diggingNow: {
    count: number;
    owner: string | null;
    utility: UtilityKind;
    /** YYYY-MM-DD. */
    until: string | null;
  } | null;
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
  // Plain spaces only, so a no-break space holds its words together.
  for (const word of text.split(/ +/).filter(Boolean)) {
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
        `<path d="${pathData(line.path)}" stroke="${colorOf(line)}"${line.assumed ? ' stroke-opacity="0.4"' : ''}/>`,
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

/** The colors in use, as a strip of chips on the map's top edge. */
const keyLayer = (plan: StreetPlan) => {
  const items = legendOf(plan.lines);
  if (!items.length) return '';
  // Barlow at 17px runs about 9 px a character.
  const widths = items.map((item) => 34 + item.label.length * 9);
  const total = widths.reduce((sum, w) => sum + w, 0) + 16;
  let x = MAP_X + 20 + 8;
  const chips = items
    .map((item, i) => {
      const chip = `<rect x="${x}" y="36" width="18" height="7" rx="3.5" fill="${item.color}"/><text x="${x + 24}" y="45" font-size="17" fill="${INK}">${escapeXml(item.label)}</text>`;
      x += widths[i]!;
      return chip;
    })
    .join('');
  return `<rect x="${MAP_X + 20}" y="20" width="${total}" height="38" rx="9" fill="#ffffff" fill-opacity="0.94"/>${chips}`;
};

// What a dig is, where the utility's own name doesn't say it: a city project isn't a utility.
const WORK_OF: Partial<Record<UtilityKind, string>> = { capital: 'city street work' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-12-31" as "Dec 31", "Dec 31, 2027" when it isn't this year's. */
export const shortDate = (day: string, today: Date = new Date()) => {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return day;
  const label = `${MONTHS[month - 1]} ${date}`;
  return year === today.getUTCFullYear() ? label : `${label}, ${year}`;
};

/** The count of digs within 500 ft, big, and the dig permitted today, if there is one. */
const factsLayer = (facts: StreetFacts, top: number, today: Date) => {
  if (!facts.permits)
    return `<text x="56" y="${top + 30}" font-size="24" fill="${INK_2}">No utility digs on record</text><text x="56" y="${top + 60}" font-size="24" fill="${INK_2}">within 500 ft yet</text>`;
  const count = facts.permits.toLocaleString('en-US');
  // Barlow Condensed's digits run under half an em at 64px, its comma about a fifth.
  const countWidth = count.replace(/,/g, '').length * 29 + (count.match(/,/g)?.length ?? 0) * 12;
  const since = facts.since !== null ? `since ${facts.since}` : 'on record';
  const big = `<text x="56" y="${top + 54}" font-family="Barlow Condensed" font-weight="800" font-size="64" fill="${INK}">${count}</text><text x="${56 + countWidth + 14}" y="${top + 54}" font-size="22" fill="${INK_2}">${since}</text><text x="56" y="${top + 86}" font-size="22" fill="${INK_2}">street ${facts.permits === 1 ? 'permit' : 'permits'} within 500 ft</text>`;
  const dig = facts.diggingNow;
  if (!dig) return big;
  const who = [dig.owner, WORK_OF[dig.utility] ?? UTILITY_STYLES[dig.utility].label.toLowerCase()]
    .filter(Boolean)
    .join(', ');
  // A no-break space keeps "until Nov 27" on one line.
  const until = dig.until
    ? `, until\u00a0${shortDate(dig.until, today).replace(/ /g, '\u00a0')}`
    : '';
  // Two lines at most: the dig itself first, then how many more if it left room.
  const described = wrapWords(`${who}${until}`, 40).slice(0, 2);
  const lines =
    described.length < 2 && dig.count > 1
      ? [...described, `and ${dig.count - 1} more within 500 ft`]
      : described;
  return `${big}<rect x="56" y="${top + 110}" width="12" height="12" rx="6" fill="${HIVIS}" stroke="${INK}" stroke-width="2"/><text x="78" y="${top + 121}" font-size="20" fill="${INK}">Digging now</text>${lines
    .map(
      (line, i) =>
        `<text x="56" y="${top + 147 + i * 24}" font-size="20" fill="${INK_2}">${escapeXml(line)}</text>`,
    )
    .join('')}`;
};

export const streetPreviewSvg = (
  text: PreviewText,
  plan: StreetPlan,
  facts: StreetFacts,
  today: Date = new Date(),
): string => {
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
  ${factsLayer(facts, cityY + 26, today)}
  ${keyLayer(plan)}
  <rect x="56" y="${HEIGHT - 86}" width="5" height="50" fill="${HIVIS}"/>
  <text x="76" y="${HEIGHT - 66}" font-size="19" fill="${INK_3}">Research, not a utility locate.</text>
  <text x="76" y="${HEIGHT - 42}" font-size="19" fill="${INK_3}">Call 811 before you dig.</text>
  <rect x="${WIDTH - 326}" y="${HEIGHT - 52}" width="306" height="34" rx="8" fill="#ffffff" fill-opacity="0.92"/>
  <text x="${WIDTH - 173}" y="${HEIGHT - 29}" font-size="17" fill="${INK_3}" text-anchor="middle">Lines as placed from public records</text>
</svg>`;
};
