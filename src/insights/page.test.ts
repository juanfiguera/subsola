import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isIconName } from '../ui/icons';

const PAGE = readFileSync(new URL('../../insights.html', import.meta.url), 'utf8');

describe('insights.html', () => {
  it('names only icons that exist, since a missing one stops the page', () => {
    const names = [...PAGE.matchAll(/data-icon="([^"]+)"/g)].map((match) => match[1]!);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(isIconName(name), name).toBe(true);
  });

  it('links the section nav only to sections on the page', () => {
    const nav = PAGE.slice(
      PAGE.indexOf('id="section-nav"'),
      PAGE.indexOf('</nav>', PAGE.indexOf('id="section-nav"')),
    );
    const targets = [...nav.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]!);
    expect(targets.length).toBeGreaterThan(0);
    for (const id of targets) expect(PAGE, id).toContain(`id="${id}"`);
  });
});
