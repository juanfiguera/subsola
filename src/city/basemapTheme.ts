/**
 * The city map's dark basemap, made from OpenFreeMap's positron at runtime rather than loading a
 * second style. Recoloring the loaded style keeps our sources and layers, switches instantly and
 * needs no key. OpenFreeMap's own `dark` style is near black and neutral, which wouldn't match
 * the scene's blue-gray ground beside it.
 *
 * Rules (docs/dark-mode.md): land lands on the scene's ground. Roads, buildings and boundaries
 * stand apart from the land by about as much as they do in daylight, as lighter blue-grays, the
 * way every dark street map draws them; positron's minor roads are a shade darker than its land,
 * which on a dark ground would read as cuts. Water stays darker than land. Text flips to light,
 * halos to the ground.
 */

export type PaintValue = unknown;

export interface BasemapLayer {
  id: string;
  type: string;
  paint?: Record<string, PaintValue>;
}

export interface PaintChange {
  layer: string;
  property: string;
  light: PaintValue;
  dark: PaintValue;
}

interface Hsla {
  h: number;
  s: number;
  l: number;
  a: number;
}

const FILL_PROPERTIES = new Set([
  'background-color',
  'fill-color',
  'fill-outline-color',
  'line-color',
  'circle-color',
  'circle-stroke-color',
  'fill-extrusion-color',
]);

// The scene's dark ground, #14181e, as hue, saturation and lightness.
const GROUND = { h: 216, s: 0.2, l: 0.098 };
// Positron's land is about this light; it lands exactly on the ground.
const LAND_L = 0.95;

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));

const rgbToHsl = (r: number, g: number, b: number, a: number): Hsla => {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l, a };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn
      ? (gn - bn) / d + (gn < bn ? 6 : 0)
      : max === gn
        ? (bn - rn) / d + 2
        : (rn - gn) / d + 4;
  return { h: h * 60, s, l, a };
};

/** Parses the color forms positron uses: #rgb, #rrggbb, rgb(), rgba(), hsl() and hsla(). */
export const parseColor = (text: string): Hsla | null => {
  const value = text.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
  if (hex) {
    const digits = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!;
    const n = Number.parseInt(digits, 16);
    return rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255, 1);
  }
  const call = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(value);
  if (!call) return null;
  const parts = call[2]!.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const number = (part: string) => Number.parseFloat(part);
  const alpha = parts[3] === undefined ? 1 : number(parts[3]);
  if (call[1]!.startsWith('rgb'))
    return rgbToHsl(number(parts[0]!), number(parts[1]!), number(parts[2]!), alpha);
  return { h: number(parts[0]!), s: number(parts[1]!) / 100, l: number(parts[2]!) / 100, a: alpha };
};

const format = ({ h, s, l, a }: Hsla) =>
  `hsla(${Math.round(h)}, ${Math.round(s * 1000) / 10}%, ${Math.round(l * 1000) / 10}%, ${Math.round(a * 1000) / 1000})`;

/**
 * A fill or line. Its distance from the land's lightness is kept and turned lighter, except for
 * water, which goes darker. Water keeps a hint of its blue; the rest take the ground's blue-gray.
 */
export const darkFill = (color: Hsla, water = false): Hsla => {
  const distance = Math.abs(color.l - LAND_L);
  const l = water ? GROUND.l - distance * 0.25 : GROUND.l + distance * 0.9;
  const blue = color.s > 0.04 && color.h > 170 && color.h < 250;
  return {
    h: blue ? color.h : GROUND.h,
    s: blue ? Math.min(0.3, color.s + 0.1) : GROUND.s,
    l: clamp(l, 0.04, 0.26),
    a: color.a,
  };
};

/** Text: dark labels turn light, the darkest the lightest, keeping any hue they had. */
export const darkText = (color: Hsla): Hsla => ({ ...color, l: clamp(0.88 - color.l * 0.6) });

const darkHalo = (color: Hsla): Hsla => ({ ...GROUND, a: color.a });

/** Recolors every color string inside a paint value, expressions included. */
const recolor = (value: PaintValue, map: (color: Hsla) => Hsla): PaintValue => {
  if (typeof value === 'string') {
    const color = parseColor(value);
    return color ? format(map(color)) : value;
  }
  if (Array.isArray(value)) return value.map((item: PaintValue) => recolor(item, map));
  return value;
};

const mapperFor = (property: string, layer: string) =>
  FILL_PROPERTIES.has(property)
    ? (color: Hsla) => darkFill(color, layer.startsWith('water'))
    : property === 'text-color' || property === 'icon-color'
      ? darkText
      : property === 'text-halo-color' || property === 'icon-halo-color'
        ? darkHalo
        : null;

/** The paint changes that turn positron dark; applying `light` again undoes them. */
export const darkBasemap = (layers: BasemapLayer[]): PaintChange[] =>
  layers.flatMap((layer) =>
    Object.entries(layer.paint ?? {}).flatMap(([property, light]) => {
      const map = mapperFor(property, layer.id);
      if (!map) return [];
      const dark = recolor(light, map);
      return JSON.stringify(dark) === JSON.stringify(light)
        ? []
        : [{ layer: layer.id, property, light, dark }];
    }),
  );
