import { SOURCES, type SourceKey } from '../sources/catalog';
import { CERTAINTY_LABELS, type Certainty } from '../scene/certainty';
import { escapeHtml } from './dom';
import { sourceLink } from './sourceLink';

/**
 * Where a line on the map comes from, in the same few rows on every line's card: how it's drawn
 * (solid or dashed, the same as on the map), how it was placed, whose records and which dataset,
 * and how current they are. Someone deciding whether to trust a line shouldn't have to read the
 * fine print to find out.
 */
export interface Provenance {
  certainty: Certainty;
  /** How the line was placed, as a short sentence. */
  placed: string;
  sources: SourceKey[];
  /** Dates the records give for this line: ['Installed', '1932'], ['Permits', '2004 to 2025']. */
  dates?: [string, string][];
  /**
   * When the citywide build these records came from was made ("November 10, 2026"), or null
   * when they were read live from the city today.
   */
  recordsAsOf: string | null;
}

/** "Con Edison permits, 2004 to 2025": a span of years, or one year, or nothing. */
export const yearSpan = (first: number | null, last: number | null): string | null => {
  if (first === null && last === null) return null;
  if (first === null || last === null || first === last) return String(first ?? last);
  return `${first} to ${last}`;
};

const sourceText = (key: SourceKey) => {
  const source = SOURCES[key];
  return `${escapeHtml(source.publisher)}, ${sourceLink(source.name, source.url)}`;
};

export const provenanceBlock = ({
  certainty,
  placed,
  sources,
  dates = [],
  recordsAsOf,
}: Provenance) => {
  const unique = [...new Set(sources)];
  const rows: [string, string][] = [
    [
      'Accuracy',
      escapeHtml(CERTAINTY_LABELS[certainty].short),
    ],
    ['Placed', escapeHtml(placed)],
    ...(unique.length
      ? [
          [unique.length > 1 ? 'Sources' : 'Source', unique.map(sourceText).join('<br>')] as [
            string,
            string,
          ],
        ]
      : []),
    ...dates.map(([label, value]): [string, string] => [escapeHtml(label), escapeHtml(value)]),
    ['Records as of', recordsAsOf ? escapeHtml(recordsAsOf) : 'Read live from the city today'],
  ];
  return `
    <section class="card-section provenance">
      <h2>Where this line comes from</h2>
      <dl class="facts">${rows.map(([term, value]) => `<dt>${term}</dt><dd>${value}</dd>`).join('')}</dl>
    </section>`;
};
