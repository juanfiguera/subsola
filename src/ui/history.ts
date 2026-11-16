// Permit-history bar charts. Each chart is one utility, so identity comes from the row
// label beside it and the APWA color is reinforcement, never the only cue.

export interface YearRange {
  start: number;
  end: number;
}

const years = ({ start, end }: YearRange) =>
  Array.from({ length: end - start + 1 }, (_, i) => start + i);

const tip = (year: number, count: number) => `${year}: ${count} permit${count === 1 ? '' : 's'}`;

/** Bar with a rounded data end and a square baseline, per the house mark spec. */
const barPath = (x: number, width: number, baseline: number, height: number, radius: number) => {
  if (height <= 0) return '';
  const r = Math.min(radius, width / 2, height);
  const top = baseline - height;
  return `M${x},${baseline}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${baseline}Z`;
};

/**
 * Row-sized sparkline. All rows share `maxCount` so a tall bar means the same thing in every row.
 */
export const sparkline = (
  byYear: Map<number, number>,
  range: YearRange,
  maxCount: number,
  color: string,
) => {
  const width = 76;
  const height = 20;
  const all = years(range);
  const slot = width / all.length;
  const barWidth = Math.max(1, slot - 1);
  const bars = all
    .map((year, i) => {
      const count = byYear.get(year) ?? 0;
      const h = count ? Math.max(2, (count / maxCount) * (height - 2)) : 0;
      return `<path d="${barPath(i * slot, barWidth, height, h, 1)}" />`;
    })
    .join('');
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
    <line class="spark-base" x1="0" x2="${width}" y1="${height - 0.5}" y2="${height - 0.5}" />
    <g fill="${color}">${bars}</g>
  </svg>`;
};

/**
 * Full-width yearly chart for the inspector, with hover targets on every year. Years before
 * `since` fade back, so the ones being compared stand out.
 */
export const historyChart = (
  byYear: Map<number, number>,
  range: YearRange,
  color: string,
  since: number | null = null,
) => {
  const width = 300;
  const height = 96;
  const plotTop = 14;
  const baseline = height - 18;
  const all = years(range);
  const slot = width / all.length;
  const gap = slot > 6 ? 2 : 1;
  const barWidth = Math.min(24, slot - gap);
  const max = Math.max(1, ...byYear.values());
  const peakYear = [...byYear.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const columns = all
    .map((year, i) => {
      const count = byYear.get(year) ?? 0;
      const h = count ? Math.max(2, (count / max) * (baseline - plotTop)) : 0;
      const x = i * slot + (slot - barWidth) / 2;
      const before = since !== null && year < since;
      return `<g class="year${before ? ' before' : ''}" data-tip="${tip(year, count)}">
        <rect class="hit" x="${i * slot}" y="0" width="${slot}" height="${baseline}" />
        <path d="${barPath(x, barWidth, baseline, h, Math.min(4, barWidth / 2))}" fill="${color}" />
      </g>`;
    })
    .join('');

  const tickYears = [range.start, Math.round((range.start + range.end) / 2), range.end];
  const ticks = tickYears
    .map((year, i) => {
      const x = (year - range.start) * slot + slot / 2;
      const anchor = i === 0 ? 'start' : i === tickYears.length - 1 ? 'end' : 'middle';
      return `<text x="${i === 0 ? 0 : i === tickYears.length - 1 ? width : x}" y="${height - 4}" text-anchor="${anchor}">${year}</text>`;
    })
    .join('');

  const peakLabel =
    peakYear !== undefined
      ? `<text class="peak" x="${Math.min(width - 2, Math.max(2, (peakYear - range.start) * slot + slot / 2))}" y="${plotTop - 4}" text-anchor="middle">${max}</text>`
      : '';

  return `<figure class="history">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Permits per year, ${range.start} to ${range.end}. Peak ${max} in ${peakYear ?? 'n/a'}.">
      <line class="axis" x1="0" x2="${width}" y1="${baseline + 0.5}" y2="${baseline + 0.5}" />
      ${columns}
      ${peakLabel}
      ${ticks}
    </svg>
  </figure>`;
};
