import { describe, expect, it } from 'vitest';
import { REGIONS } from '../regions';
import { CONFIDENCE_LABELS, type SourceKey } from '../sources/catalog';
import { aboutCard, aboutSources, sourceTally } from './about';
import type { SourceStatus } from './sources';

const statuses = (entries: [SourceKey, SourceStatus][]) => new Map(entries);
const NYC = REGIONS[0]!;

describe('sourceTally', () => {
  it('says nothing before any source has been asked', () => {
    expect(sourceTally(new Map())).toBe('');
  });

  it('counts what is still loading first', () => {
    const tally = sourceTally(
      statuses([
        ['osm', { state: 'ok', count: 3 }],
        ['conEdStructures', { state: 'loading' }],
      ]),
    );
    expect(tally).toBe('1 still loading');
  });

  it('says all answered only when every source did', () => {
    const ok: SourceStatus = { state: 'ok', count: 0 };
    expect(sourceTally(statuses([['osm', ok]]))).toBe('Answered');
    expect(
      sourceTally(
        statuses([
          ['osm', ok],
          ['conEdStructures', ok],
        ]),
      ),
    ).toBe('All 2 answered');
  });

  it('counts a source that failed as not answered', () => {
    const tally = sourceTally(
      statuses([
        ['osm', { state: 'ok', count: 3 }],
        ['conEdStructures', { state: 'error', message: 'timeout' }],
      ]),
    );
    expect(tally).toBe('1 of 2 answered');
  });
});

describe('aboutSources', () => {
  it('prints each state in words, so it never rests on color', () => {
    const html = aboutSources(
      statuses([
        ['osm', { state: 'ok', count: 1234 }],
        ['conEdStructures', { state: 'error', message: 'timeout' }],
        ['dcMains', { state: 'loading' }],
      ]),
    );
    expect(html).toContain('1,234 records');
    expect(html).toContain('Did not respond');
    expect(html).toContain('Loading…');
    expect(html).toContain('id="about-sources"');
  });

  it('keeps failed and loading sources in view and folds the full list', () => {
    const html = aboutSources(
      statuses([
        ['osm', { state: 'ok', count: 5 }],
        ['conEdStructures', { state: 'error', message: 'timeout' }],
      ]),
    );
    const [shown, folded] = html.split('<details');
    expect(shown).toContain('Did not respond');
    expect(shown).not.toContain('5 records');
    expect(folded).toContain('5 records');
    expect(folded).toContain('See all 2 sources');
  });

  it('reopens the full list when it was open before a redraw', () => {
    const ok = statuses([['osm', { state: 'ok', count: 1 }]]);
    expect(aboutSources(ok)).not.toContain(' open>');
    expect(aboutSources(ok, true)).toContain(' open>');
  });

  it('explains an empty list instead of showing nothing', () => {
    expect(aboutSources(new Map())).toContain('Search an address');
  });
});

describe('aboutCard', () => {
  const html = aboutCard(new Map(), NYC);

  it('keeps the 811 warning for the city on screen', () => {
    expect(html).toContain(NYC.markout.center);
    expect(html).toContain(NYC.markout.notice);
    expect(html).toContain('not a utility locate');
  });

  it('lists every confidence label it explains', () => {
    for (const confidence of [
      'surveyed',
      'utility',
      'block-level',
      'lot-level',
      'crowdsourced',
      'inferred',
    ] as const)
      expect(html).toContain(CONFIDENCE_LABELS[confidence].label);
  });

  // Insights, AI assistants, Privacy and contact live in the site links row under the card.
  it('offers feedback and leaves the other links to the site links row', () => {
    expect(html).toContain('data-action="feedback"');
    expect(html).not.toContain('More from Subsola');
    expect(html).not.toContain('href="/insights"');
  });

  it('never uses an em dash', () => {
    expect(html).not.toContain('—');
  });
});
