import { describe, expect, it } from 'vitest';
import { provenanceBlock, yearSpan } from './provenance';

describe('yearSpan', () => {
  it('reads a span, one year, or nothing', () => {
    expect(yearSpan(2004, 2025)).toBe('2004 to 2025');
    expect(yearSpan(2005, 2005)).toBe('2005');
    expect(yearSpan(null, 2019)).toBe('2019');
    expect(yearSpan(null, null)).toBeNull();
  });
});

describe('provenanceBlock', () => {
  it('names the publisher and dataset, how it was placed and how current it is', () => {
    const html = provenanceBlock({
      certainty: 'measured',
      placed: 'On the mapped route.',
      sources: ['sfSewerMains', 'sfSewerMains'],
      dates: [['Installed', '1932']],
      recordsAsOf: 'November 10, 2026',
    });
    expect(html).toContain('Mapped and measured');
    expect(html).toContain('SF Public Works');
    expect(html.match(/<dt>Source<\/dt>/g)).toHaveLength(1);
    expect(html).toContain('<dt>Installed</dt><dd>1932</dd>');
    expect(html).toContain('November 10, 2026');
  });

  it('says when records were read live, and marks an estimate', () => {
    const html = provenanceBlock({
      certainty: 'estimated',
      placed: 'From permits.',
      sources: [],
      recordsAsOf: null,
    });
    expect(html).toContain('Estimated');
    expect(html).toContain('Read live from the city today');
    expect(html).not.toContain('<dt>Source');
  });
});
