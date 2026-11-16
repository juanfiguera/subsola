/**
 * The page's charts, as plain DOM: a list of labelled bars and a stacked share bar. Every value is
 * printed next to its bar, so the chart reads on a phone, in a screenshot and to a screen reader;
 * the bars themselves are decoration and hidden from assistive tech. Text goes in through
 * textContent only.
 */

type Child = Node | string;

export const h = (
  tag: string,
  attributes: Record<string, string> = {},
  ...children: Child[]
): HTMLElement => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.append(...children);
  return node;
};

export interface Series {
  name: string;
  /** A class from insights.css: tone-ink, tone-mid, tone-light. */
  tone: string;
}

export interface BarRow {
  label: string;
  /** One per series, in the same order; null leaves the bar empty and prints the text alone. */
  values: { value: number | null; text: string }[];
}

const legend = (series: Series[]) =>
  h(
    'ul',
    { class: 'legend' },
    ...series.map(({ name, tone }) =>
      h('li', {}, h('span', { class: `swatch ${tone}`, 'aria-hidden': 'true' }), name),
    ),
  );

/**
 * Horizontal bars, one row per label, scaled so `max` fills the track. `valueWidth` (rem) fits the
 * longest printed value, so every track in the chart starts and ends in line.
 */
export const barChart = (
  rows: BarRow[],
  series: Series[],
  max: number,
  valueWidth = 4.5,
): HTMLElement => {
  const scale = max > 0 ? max : 1;
  const list = h(
    'ul',
    { class: 'bars' },
    ...rows.map((row) =>
      h(
        'li',
        { class: 'bar-row' },
        h('span', { class: 'bar-label' }, row.label),
        h(
          'span',
          { class: 'bar-lines' },
          ...row.values.map(({ value, text }, index) => {
            const fill = h('span', { class: `bar-fill ${series[index]?.tone ?? 'tone-ink'}` });
            // An empty bar for nothing; the 2px floor is for small values that would vanish.
            if (!value) fill.style.minWidth = '0';
            fill.style.width = `${Math.max(0, Math.min(100, ((value ?? 0) / scale) * 100))}%`;
            return h(
              'span',
              { class: 'bar-line' },
              h('span', { class: 'bar-track', 'aria-hidden': 'true' }, fill),
              h(
                'span',
                { class: 'bar-value' },
                series.length > 1
                  ? h('span', { class: 'visually-hidden' }, `${series[index]?.name ?? ''}: `)
                  : '',
                text,
              ),
            );
          }),
        ),
      ),
    ),
  );
  list.style.setProperty('--value-w', `${valueWidth}rem`);
  return series.length > 1 ? h('div', { class: 'chart' }, legend(series), list) : list;
};

export interface StackPart {
  label: string;
  pct: number;
  color: string;
}

/** One bar split by share, with a printed key under it. */
export const stackBar = (parts: StackPart[]): HTMLElement => {
  const bar = h('span', { class: 'stack', 'aria-hidden': 'true' });
  for (const part of parts) {
    const segment = h('span', { class: 'stack-part' });
    segment.style.flexGrow = String(part.pct);
    segment.style.background = part.color;
    bar.append(segment);
  }
  const key = h(
    'ul',
    { class: 'stack-key' },
    ...parts.map((part) => {
      const swatch = h('span', { class: 'swatch', 'aria-hidden': 'true' });
      swatch.style.background = part.color;
      return h('li', {}, swatch, `${part.label} ${part.pct.toFixed(1).replace(/\.0$/, '')}%`);
    }),
  );
  return h('div', { class: 'stack-chart' }, bar, key);
};
