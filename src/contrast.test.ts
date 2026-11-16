import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RECYCLED_WATER, UTILITY_KINDS, UTILITY_STYLES } from './utilities';
import { scenePalette } from './scene/palette';

/**
 * Dark mode's contrast, checked rather than eyeballed (docs/dark-mode.md): WCAG AA, 4.5:1 for
 * text and 3:1 for marks (chart bars, swatches, toggles, focus rings, pipes on the ground). Reads
 * the dark tokens straight from the stylesheets, so a tweak there can't slip past.
 */

type Rgb = [number, number, number];

const parse = (value: string, over: Rgb = [0, 0, 0]): Rgb => {
  const hex = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(value.trim());
  if (hex) {
    const digits = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!;
    const n = Number.parseInt(digits, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(
    value.trim(),
  );
  if (!rgb) throw new Error(`can't read color ${value}`);
  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
  // A see-through color is judged as it lands on the surface under it.
  return [1, 2, 3].map((i, k) => Number(rgb[i]) * alpha + over[k]! * (1 - alpha)) as Rgb;
};

const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

/** The custom properties set inside `:root[data-theme='dark'] { ... }` of a stylesheet. */
const darkTokens = (path: string) => {
  const css = readFileSync(new URL(path, import.meta.url), 'utf8');
  const start = css.indexOf(":root[data-theme='dark'] {");
  if (start < 0) throw new Error(`${path} has no dark block`);
  const block = css.slice(start, css.indexOf('}', start));
  const tokens = new Map<string, string>();
  for (const match of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens.set(match[1]!, match[2]!);
  return (name: string) => {
    const value = tokens.get(name);
    if (!value) throw new Error(`${path} dark block has no ${name}`);
    return value;
  };
};

const UTILITY_HEXES = [
  ...UTILITY_KINDS.map((kind) => UTILITY_STYLES[kind].color),
  RECYCLED_WATER.color,
];

describe('map chrome, dark', () => {
  const token = darkTokens('./style.css');
  const color = (name: string, over?: Rgb) => parse(token(name), over);
  const surfaces = ['--ground', '--panel', '--panel-2'];

  it.each(['--ink', '--ink-2', '--ink-3'])('%s text passes 4.5:1 on every surface', (ink) => {
    for (const surface of surfaces)
      expect(ratio(color(ink), color(surface)), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['--danger', '--panel'],
    ['--danger', '--panel-2'],
    ['--on-ink', '--ink'],
    ['--warn-ink', '--warn-bg'],
    ['--tip-ink', '--tip-bg'],
    ['--tip-ink-2', '--tip-bg'],
  ])('%s text on %s passes 4.5:1', (text, surface) => {
    const under = color('--ground');
    expect(ratio(color(text, under), color(surface, under))).toBeGreaterThanOrEqual(4.5);
  });

  it('the 811 button keeps its dark text on hi-vis yellow', () => {
    expect(ratio(parse('#ffd60a'), color('--on-hivis'))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['--ink', '--panel', 'focus ring and ink toggles'],
    ['--switch-off', '--panel', 'a switch that is off'],
    ['--handle', '--panel', 'the sheet handle'],
    ['--axis', '--panel', 'the history chart axis'],
  ])('%s on %s passes 3:1 (%s)', (mark, surface) => {
    const under = color(surface);
    expect(ratio(color(mark, under), under)).toBeGreaterThanOrEqual(3);
  });

  it('every utility color passes 3:1 on the panel, for swatches and history bars', () => {
    for (const hex of UTILITY_HEXES)
      expect(ratio(parse(hex), color('--panel')), hex).toBeGreaterThanOrEqual(3);
  });
});

describe('insights page, dark', () => {
  const token = darkTokens('./insights/insights.css');
  const color = (name: string) => parse(token(name));

  it.each(['--ink', '--ink-2', '--ink-3'])('%s text passes 4.5:1 on ground and panel', (ink) => {
    for (const surface of ['--ground', '--panel', '--panel-2'])
      expect(ratio(color(ink), color(surface)), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  });

  it('bar tones pass 3:1 on the bar track and keep their order', () => {
    const track = color('--panel-2');
    const tones = ['--ink', '--mid', '--light'].map((name) => ratio(color(name), track));
    for (const tone of tones) expect(tone).toBeGreaterThanOrEqual(3);
    expect(tones[0]).toBeGreaterThan(tones[1]!);
    expect(tones[1]).toBeGreaterThan(tones[2]!);
  });

  it('every material color passes 3:1 on the panel', () => {
    const names = [
      ...Array.from({ length: 12 }, (_, i) => `--material-${i + 1}`),
      '--material-other',
      '--material-unrecorded',
    ];
    for (const name of names)
      expect(ratio(color(name), color('--panel')), name).toBeGreaterThanOrEqual(3);
  });
});

describe('3D scene, dark', () => {
  const palette = scenePalette('dark');
  const ground = parse(darkTokens('./style.css')('--ground'));
  const rgb = (rgba: readonly number[]): Rgb => [rgba[0]!, rgba[1]!, rgba[2]!];
  const over = (rgba: readonly number[], under: Rgb): Rgb =>
    rgb(rgba).map((c, i) => c * (rgba[3]! / 255) + under[i]! * (1 - rgba[3]! / 255)) as Rgb;

  it('the palette ground matches the stylesheet ground under the canvas', () => {
    expect(rgb(palette.hollow)).toEqual(ground);
  });

  it('every pipe color passes 3:1 on the ground and the road, unchanged from APWA', () => {
    for (const hex of UTILITY_HEXES) {
      expect(ratio(parse(hex), ground), `${hex} on ground`).toBeGreaterThanOrEqual(3);
      expect(ratio(parse(hex), rgb(palette.road)), `${hex} on road`).toBeGreaterThanOrEqual(3);
    }
  });

  it('tags pass 4.5:1', () => {
    expect(ratio(rgb(palette.onInk), rgb(palette.ink))).toBeGreaterThanOrEqual(4.5);
    const tag = over(palette.streetTagBackground, rgb(palette.road));
    expect(ratio(rgb(palette.streetTagText), tag)).toBeGreaterThanOrEqual(4.5);
  });

  it('painted street names pass 3:1 on the road (large text)', () => {
    expect(ratio(rgb(palette.label), rgb(palette.road))).toBeGreaterThanOrEqual(3);
  });

  it('ink marks (selection, address stem, live work pulse) pass 3:1 on the road', () => {
    expect(ratio(rgb(palette.ink), rgb(palette.road))).toBeGreaterThanOrEqual(3);
  });
});
