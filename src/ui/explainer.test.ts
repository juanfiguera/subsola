import { describe, expect, it } from 'vitest';
import { explainerHtml } from './explainer';
import { phoneKeyHtml } from './phoneKey';
import { DEN, NYC } from '../regions';

describe('explainerHtml', () => {
  it("names the street's utilities, how exact the lines are, and the city's 811", () => {
    const html = explainerHtml({
      region: NYC,
      utilities: ['gas', 'water', 'steam'],
      recycled: false,
      stretch: 6,
    });
    expect(html).toContain('Steam');
    expect(html).not.toContain('Telecom');
    expect(html).toContain('Mapped and measured.');
    expect(html).toContain('Estimated.');
    expect(html).not.toContain('Dashed');
    expect(html).toContain('stretched 6×');
    expect(html).toContain(NYC.markout.url);
    expect(html).toContain('not what a locator would find');
  });

  it('falls back to the five main utilities before anything loads', () => {
    const html = explainerHtml({ region: DEN, utilities: [], recycled: false, stretch: 4 });
    for (const label of ['Electric', 'Gas', 'Telecom', 'Water', 'Sewer'])
      expect(html).toContain(label);
    expect(html).not.toContain('Steam');
  });
});

describe('phoneKeyHtml', () => {
  it('lists the utilities here, with steam only where there is steam', () => {
    expect(phoneKeyHtml(['water', 'sewer'], false)).not.toContain('Steam');
    expect(phoneKeyHtml(['water', 'steam'], false)).toContain('Steam');
    expect(phoneKeyHtml(['water'], true)).toContain('Recycled water');
  });

  it('carries a way to the explainer', () => {
    const html = phoneKeyHtml([], false);
    expect(html).toContain('data-action="explainer"');
    expect(html).toContain('data-action="close-key"');
  });
});
